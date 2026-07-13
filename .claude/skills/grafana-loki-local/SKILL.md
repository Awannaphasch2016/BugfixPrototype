---
name: grafana-loki-local
description: How this repo runs the fully local Grafana + Loki + Alloy signaling layer that tails demo-app/logs/app.log and fires the planted-signature alert into the chat routing route. Use when changing harness/observability/, debugging a missing log stream / non-firing alert / missing webhook, tuning alert latency, or re-verifying the detection scene.
---

# Grafana + Loki + Alloy on localhost — the signaling layer's front end

Three pinned containers turn the demo app's pino log into the live detection
scene: Alloy tails `demo-app/logs/app.log` into Loki; Grafana renders the
"Signals — Tasks app" dashboard and evaluates one fast alert on the planted
signature `task update failed validation`; the alert's webhook POSTs to the
chat backend's routing route (`http://host.docker.internal:4000/api/signal`,
which reads `alerts[0].annotations.signature` — see
`harness/chat/app/api/signal/route.ts`). Everything below was verified live
on 2026-07-13 with the pinned images. Promtail is EOL — Alloy is its
successor and the only log shipper this repo uses.

## Compose layout (all under `harness/observability/`)

```
docker-compose.yml            grafana/grafana:13.1.0, grafana/loki:3.7.2,
                              grafana/alloy:v1.17.1 (Alloy tags carry a "v";
                              Grafana/Loki tags don't)
up.sh / down.sh               idempotent wrappers; up.sh waits on /api/health
loki/loki-config.yaml         single-binary Loki, filesystem storage, no auth
alloy/config.alloy            loki.source.file → loki.write, tail_from_end
grafana/provisioning/
  datasources/loki.yaml       uid "loki" (the dashboard and alert reference it)
  dashboards/dashboards.yaml  file provider watching /var/lib/grafana/dashboards
  alerting/signals.yaml       alert rule + contact points + notification policy
grafana/dashboards/
  signals-tasks-app.json      uid "signals-tasks-app": volume-by-level,
                              signature firings, recent-log-lines panels
```

Ports: Grafana **3001** (3000 is the demo app), Loki 3100 (exposed for
verification curls). Grafana logs in nobody: anonymous access with the Admin
role (needed to *view* alert rules), plus admin/admin for API calls.
`harness/install.sh` pre-pulls the pinned images (`docker compose pull`) so
demo day downloads nothing.

## The alert → webhook flow

Rule `planted-signature-task-validation` (folder Signals, group `signals`):

- Query A (Loki, **instant**): ``sum(count_over_time({job="demo-app"} |=
  `task update failed validation` [1m]))`` — instant, not range, so the
  threshold node C (`A > 0`) consumes the vector without a reduce step.
- `annotations.signature: task update failed validation` — this exact string
  is what the routing route extracts from the webhook body.
- `labels.signal: task-validation` — the notification policy routes ONLY
  this label to the `signal-webhook` contact point; the policy root points
  at the inert `signals-blackhole` email receiver.

Webhook body shape (captured live): standard Grafana alertmanager payload —
top-level `status: "firing"`, `alerts[0].{status, labels, annotations:
{signature}, startsAt, values: {A: 1, C: 1}}`, plus `commonAnnotations`,
`title`, `message`. The route only needs `alerts[0].annotations.signature`.

## Timing knobs (latency kills the scene)

- Rule-group `interval: 10s` — the evaluation clock (10s is Grafana's
  default minimum; don't go lower without `GF_UNIFIED_ALERTING_MIN_INTERVAL`).
- Rule `for: 0s` — no pending period; first breaching eval → Alerting.
- Route `group_wait: 0s` — notify immediately on firing.
- Measured live, twice: **trigger → Alerting ~13s, → webhook ~10–15s** (one
  eval cycle plus delivery). Resolution: the signature ages out of the `[1m]`
  window ~60–75s after the last firing line; the query then returns NoData,
  and `noDataState: OK` folds that back to Normal (state shows as
  "Normal (NoData)" — that is healthy idle, not a broken datasource).

## Verifying each hop

1. **Trigger** — `harness/trigger.sh` PATCHes a real task with a >100-char
   title; the demo app logs the signature. Check: `grep -c "task update
   failed validation" demo-app/logs/app.log` grew by one.
2. **Alloy → Loki** — `curl -s http://localhost:3100/loki/api/v1/labels`
   should list `job`/`app`; then
   `curl -sG http://localhost:3100/loki/api/v1/query --data-urlencode
   'query=count_over_time({job="demo-app"}[5m])'`. Nothing there? Alloy tails
   from the end — generate any fresh line (`curl localhost:3000/api/tasks`)
   and re-check; also `docker logs observability-alloy-1` should say
   "start tailing file".
3. **Dashboard** — http://localhost:3001/d/signals-tasks-app, or query the
   signature expr through `POST /api/ds/query` (admin/admin) and look for
   nonzero points.
4. **Alert** — `curl -su admin:admin
   localhost:3001/api/prometheus/grafana/api/v1/alerts` → `state` walks
   `Normal (NoData)` → `Alerting` within one eval cycle of the trigger.
5. **Webhook** — never test against the real chat route (it files GitHub
   issues). Point the contact point at a throwaway listener instead: edit
   the `url` in `grafana/provisioning/alerting/signals.yaml` to e.g.
   `http://host.docker.internal:9095/api/signal`, run a tiny Python
   `http.server` handler that dumps POST bodies, reload provisioning (below),
   trigger, capture, then **restore the 4000 URL only after the alert is back
   to Normal** — reloading while still firing can deliver the pending
   notification to the restored URL.

## Gotchas (each one was hit live)

- **A provisioned policy tree cannot reference `grafana-default-email`.**
  Provisioning runs before the default Alertmanager config exists;
  Grafana 13 then **fails to boot entirely** ("receiver 'grafana-default-email'
  does not exist" cascades through every module). The policy root must be a
  contact point provisioned in the same file — hence `signals-blackhole`.
- **Resolved notifications carry the signature too.** A webhook contact
  point sends "resolved" POSTs by default, and `alerts[0].annotations.signature`
  is present in them — the routing route would parse a resolution as a fresh
  signal. `disableResolveMessage: true` on the receiver stops it (verified:
  with the flag, firing arrives, no resolved follow-up).
- **`tail_from_end = true` in Alloy is a safety requirement, not a nicety.**
  The committed log already contains historical signature lines; a
  from-the-start ingest stamps them "now", fires the alert at first boot,
  and webhooks the real routing route before anyone touched the app. Tail
  positions persist in the `alloy-data` volume so restarts never re-ingest
  either. Corollary: after `docker compose down -v`, first boot is again
  end-of-file — history is not re-shipped, and the dashboard starts empty
  until fresh lines arrive.
- **Provisioned alerting objects are read-only in the Grafana UI.** Edit the
  YAML, then either `docker compose restart grafana` or (faster, no restart)
  `curl -su admin:admin -X POST
  localhost:3001/api/admin/provisioning/alerting/reload` — verified to apply
  contact-point changes live. Dashboards from the file provider re-scan on
  their own; datasource changes need a restart or the same-family reload.
- **Loki instant-query-on-nothing is NoData, not zero.** `count_over_time`
  over a window with no matching lines returns an empty vector; without
  `noDataState: OK` the rule flaps into the NoData state instead of staying
  Normal.
- **Bind-mount paths are compose-file-relative.** `../../demo-app/logs`
  resolves from `harness/observability/`, so the stack works from any cwd via
  the wrapper scripts; the mount is read-only (`:ro`) — the signaling layer
  must never write the app's log.
- **`extra_hosts: host.docker.internal:host-gateway`** (on the Grafana
  service) is what lets the alert webhook reach host ports on Linux; it is
  not automatic like on Docker Desktop.
- **Set `GF_SERVER_ROOT_URL`.** Otherwise every link Grafana generates
  (webhook `generatorURL`, silence links) points at its default
  `localhost:3000` — which here is the demo app.
- **YAML vs LogQL quoting:** keep the LogQL backtick raw string and wrap the
  whole `expr` in single-quoted YAML; inside the dashboard JSON use `\"` for
  LogQL double quotes and literal backticks.
- **Levels are pino numbers.** The volume-by-level panel maps them at query
  time with `| json | label_format level=`{{...}}`` (30=info, 40=warn,
  50=error); labels shipped by Alloy stay low-cardinality (`job`, `app` only).
- **Loki answers `/ready` with "Ingester not ready: waiting for 15s"** for
  the first ~15s after boot — harmless; up.sh gates on Grafana health, and
  Alloy retries pushes.
