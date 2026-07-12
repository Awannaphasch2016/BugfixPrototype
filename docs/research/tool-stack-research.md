# Tool-stack research: buy vs build for the bug-fix pipeline demo

Research date: **2026-07-12**. All pricing/free-tier claims are as of that date and cite
primary sources only (official docs, pricing pages, GitHub repos, first-party blogs).
Facts that could not be verified from a primary source are flagged as such.

Frame: the pipeline already exists — `harness/run.sh` turns a GitHub issue into an open
PR by spawning a non-interactive Claude Code fixer agent locally; GitHub is the system of
record; the demo app seeds `logs/app.log` with planted error signatures. Total build
budget 15h, of which the tools below may claim **~4–7h combined**. Selection pressure:
visible on GitHub or a dashboard within minutes, free, low demo-day fragility (local
beats SaaS/webhook where possible), and able to trigger or feed the **local** runner.

---

## Executive summary

- **Question A (signaling + context engineering).** The winning shape is a **fully local
  loop**: Grafana + Loki + Alloy tails `logs/app.log` and pushes an alert webhook to a
  `localhost` endpoint the runner listens on — the only evaluated product that natively
  triggers a local script with zero SaaS/tunnel dependency. Context engineering is best
  witnessed with **Microsoft Presidio** (MIT, local, actively maintained) redacting PII
  from the log excerpt before agent handoff, plus an **open-weights local reranker**
  (mxbai-rerank / bge-reranker, both Apache-2.0) scoring candidate context — with the
  scores posted to the GitHub issue as the visible artifact. Datadog and Sentry are
  credible but trial-gated or plan-gated exactly where this demo needs them; Snowflake
  Cortex is wrong-shaped for a local log file; **Upside turned out to be a GTM
  revenue-attribution platform with zero signaling-layer relevance**; Highlight.io is
  effectively dead.
- **Question B (prebuilt role agents).** No general framework (LangGraph, CrewAI,
  OpenHands, SWE-agent, Aider) ships reusable planner/reviewer/tester **role prompts** —
  they ship loops or scaffolding. The real prebuilt-prompt supply is in the Claude Code
  ecosystem itself: **Anthropic's official plugins** (`pr-review-toolkit`,
  `feature-dev` — reviewer, test-analyzer, planner agents, Apache-2.0) and the
  MIT-licensed community collections **wshobson/agents** (37.8k stars) and
  **VoltAgent/awesome-claude-code-subagents** (23.2k stars). These are drop-in
  `.claude/agents/*.md` files invoked from the existing runner via
  `claude -p --agent <role>` — no SDK rewrite. For PR-visible role artifacts,
  **CodeRabbit** (free forever on public repos, auto-reviews on PR open) and Qodo's
  MIT **PR-Agent CLI** (runs locally with an Anthropic key) are the two adoptable
  reviewers.
- **Question C (agent-session trace UI).** Buy, don't build: **daaain/claude-code-log**
  (MIT, actively maintained) renders the exact JSONL transcript `run.sh` already saves
  into static HTML with one `uvx` command — replacing the planned ~1h hand-built trace
  page with ~15 minutes. The ambitious option — replaying a headless run inside
  **Zed's agent panel via ACP** — is mechanically supported (verified from spec,
  adapter source, and Zed docs) but replays the live session store, not the saved
  copy, and was not executed end-to-end; treat as an optional showpiece behind a 1h
  validation gate. Langfuse is the wrong shape (fleet monitoring; Claude Code trace
  export still beta).
- **Question D (browser/UI automation).** **Playwright MCP** wins outright: the only
  option that composes natively with the headless `claude -p` runner (one `.mcp.json`
  line), drives the browser via deterministic accessibility-tree snapshots rather than
  pixels, takes screenshots, and is Microsoft-maintained — under 1h of setup. "opencli"
  resolved to **OpenCLI (jackwener/opencli)** — real, active, Apache-2.0 — but its
  logged-in-Chrome/extension architecture solves problems localhost doesn't have.
  browser-use/Stagehand nest a second agent loop; Skyvern is AGPL and heavy; Anthropic
  computer use is beta, pixel-based, and not exposed in Claude Code. Hard constraint
  found: `gh` cannot upload images to PR comments — evidence screenshots must be
  committed to the PR branch and embedded by URL.
- **Fact corrections worth carrying into any pitch:** Anthropic has no first-party
  reranker or embedder (its docs point to Voyage AI — which **MongoDB** acquired in
  Feb 2025, not Anthropic); Datadog's permanent free plan excludes Log Management and
  Error Tracking entirely; CodeRabbit silently skips **draft** PRs by default; Qodo's
  test-generation OSS (qodo-cover) is officially unmaintained; "Paperclips" is a real
  (4-month-old, MIT, 73k-star) multi-agent orchestrator — real product, wrong scale for
  a one-agent pipeline.

---

## Question A — Signaling layer + context engineering

### Summary table

| Tool | Capability witnessed | Free tier (2026-07-12) | Setup | Fragility | Local trigger/feed | Audience sees | Verdict |
|---|---|---|---|---|---|---|---|
| Grafana + Loki + Alloy (self-hosted) | Log tailing, LogQL detection, alert → webhook | Free OSS, no account | 3–5h | **Lowest** — fully local, 3 containers | **Native push to `localhost`** | Live dashboard + firing alert | **Adopt** |
| OTel Collector (filelog → filter → otlphttp) | Ingest, noise filtering, PII redaction processor | Free OSS | 2–3h | Very low — 1 container, local | Push OTLP to local listener | Nothing (headless) — pair with Grafana | Adopt-lite / mention |
| Microsoft Presidio | PII detection + redaction before handoff | Free, MIT | 0.5–1h | Low (pre-download spaCy model) | Native — Python step in runner | Before/after redacted log excerpt on the issue | **Adopt** |
| Mixedbread mxbai (embed/rerank) | Reranking/embedding for context selection | Open weights, Apache-2.0; hosted has only $5 one-time credit | 1–2h | None at demo time (local weights) | Native — library in runner | Rerank-score table posted to issue/PR | **Adopt** (local weights) |
| BAAI bge-reranker-v2-m3 | Same, alternative model | Apache-2.0, local | 1h | None | Native | Same | Alternate to mxbai |
| Voyage AI rerank-2.5 (MongoDB) | Hosted reranking | First 200M tokens free | 0.5h | SaaS + key | HTTP call from runner | Same score table | Mention (best free hosted deal) |
| Cohere Rerank (v4.0) | Hosted reranking | Trial key free, 10 req/min; PAYG price not verifiable first-party | 0.5h | SaaS + rate limit | HTTP call from runner | Same | Mention |
| Sentry (SaaS) | Error capture, best-in-class dedup/fingerprinting | Developer: 5k errors/mo, 1 seat, **no GitHub integration** | 1–2h | SaaS; webhooks need tunnel; polling OK | Poll issues API from runner | Sentry issues dashboard | Mention/optional |
| Datadog | Logs, Error Tracking, Watchdog, monitors | **Free plan = infra only, no logs**; 14-day trial | 3–5h | Trial clock + SaaS; poll Events API | Poll (webhook needs tunnel) | Log Explorer + Error Tracking | Reject for build; mention |
| Snowflake Cortex | SQL-native AI classify/search | 30-day/$400 trial, ~10 Cortex credits/day cap | 4–6h | Trial clock; data gravity wrong | Poll only | Snowsight worksheets | **Reject** |
| Highlight.io | Error monitoring (was) | Hosted product sunset 2026-02-28 | n/a | Maximal (dead) | n/a | An abandoned product | **Reject** |
| Upside (upside.tech) | None — GTM revenue attribution | No public free tier | n/a | n/a | n/a | n/a | **Reject — irrelevant** |
| LlamaIndex / LangChain pipelines | Wrappers over the above | MIT/free OSS | 0.5–1h + abstraction tax | Depends on backend | Library | Nothing framework-specific | Reject for build; mention |
| Unstructured (OSS lib) | PDF/doc parsing into context | Apache-2.0; hosted 15k pages/mo free | 1–2h (heavy install) | Low (local) | Native library | Nothing directly | Reject (manufactured problem) |
| promptfoo | Eval of the context step (assertions, local viewer) | MIT, free OSS | 1–2h | Low; deterministic-assertion fallback | Local CLI | Pass/fail matrix in local web viewer | Optional adopt |
| Ragas | RAG metrics (faithfulness, context precision) | Apache-2.0 | 2–4h | Judge-LLM API dependency | Python harness | Terminal numbers | Mention only |
| Notion (API/MCP) | External runbook retrieval | Free-plan API access **unverified** from primary sources | 1–2h | Med-high (OAuth, SaaS, plan ambiguity) | REST from runner | A second window competing with GitHub | Reject |
| Linear | Mirror tracker, auto-close on merge | Free: 250 issues, API+webhooks included | ~2h | Low-med (sync timing) | GraphQL POST from runner | Linear board card auto-moving to Done | Optional / mention |

### Per-tool notes

#### Upside — identity resolved: irrelevant

Two unrelated companies share the name. **upside.tech** is the "AI GTM" one: its own site
positions it as "the data layer for the age of agentic GTM" — revenue attribution and
buyer-journey intelligence over CRM/email/call data, with MCP integrations for GTM
copilots (https://www.upside.tech/). **upside.com** is a consumer cashback app
(https://www.upside.com/). Nothing on upside.tech mentions application logs, error
monitoring, or developer observability; the only overlap with this demo is vocabulary
("signals", "context for agents") — its signals are CRM touchpoints. No public pricing
(as of 2026-07-12). **Plainly irrelevant to a log-signaling layer; drop it.**

#### Mixedbread / mxbai — the local context-engineering ingredient

- `mxbai-embed-large-v1`: 0.3B-param embedding model, 1024-dim Matryoshka, Apache-2.0
  open weights (https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1).
- `mxbai-rerank` v2 family (base-v2 0.5B, large-v2 1.5B; v1 xsmall 0.1B): Apache-2.0,
  `pip install mxbai-rerank`, local inference
  (https://github.com/mixedbread-ai/mxbai-rerank;
  https://www.mixedbread.com/blog/mxbai-rerank-v2).
- Hosted platform has **no permanent free tier**: $5 one-time credits, then $20/mo Scale
  (https://www.mixedbread.com/pricing, as of 2026-07-12) — and it is now oriented around
  managed stores, so the local-weights path is the natural one here.
- Setup ~1–2h; on CPU use `rerank-base-v2` or smaller (repo latency figures are
  A100-measured). Zero demo-day network dependency once weights are pre-downloaded.
- Invisible by itself — surface it by posting the context-selection table (candidate
  files/log excerpts + rerank scores) into the GitHub issue before the fixer run.

#### Rerankers: the wider field (verified corrections included)

- **Anthropic ships no reranker or embedder** — its docs say so and delegate embeddings
  to Voyage AI (https://platform.claude.com/docs/en/docs/build-with-claude/embeddings).
- **Voyage AI belongs to MongoDB**, acquired 2025-02-24
  (https://www.mongodb.com/company/newsroom/press-releases/mongodb-announces-acquisition-of-voyage-ai);
  docs brand as "Voyage AI by MongoDB". `rerank-2.5` is $0.05/M tokens with the **first
  200M tokens free per account** (https://docs.voyageai.com/docs/pricing, as of
  2026-07-12) — the best verified free hosted reranking deal.
- **Cohere Rerank** is now generation 4.0 (`rerank-v4.0-pro`/`-fast`;
  https://docs.cohere.com/docs/rerank). Trial keys are free but rate-limited to
  10 req/min on rerank (https://docs.cohere.com/docs/rate-limits). Its pay-as-you-go
  per-1K-searches price **could not be verified from cohere.com** as fetched
  (https://cohere.com/pricing shows only dedicated-instance rates) — third-party figures
  exist but are not trusted here.
- **BAAI bge-reranker-v2-m3**: Apache-2.0, 0.6B, fully local via sentence-transformers
  (https://huggingface.co/BAAI/bge-reranker-v2-m3) — the safest license + offline pick.
- **Jina Reranker**: 10M free API tokens, but open weights are **CC-BY-NC 4.0**
  (non-commercial) — wrong license for a consulting-pitch repo (https://jina.ai/reranker).

#### Datadog — polished, but the free plan does not cover this demo

- Permanent Free plan is **infrastructure monitoring only** (5 hosts, 1-day retention);
  Log Management ($0.10/GB ingest + indexing) and Error Tracking (from $25/mo) are paid
  SKUs (https://www.datadoghq.com/pricing/, as of 2026-07-12). Whether the free plan
  includes alerting monitors could not be unambiguously verified.
- The **14-day trial** (no card) does include logs
  (https://www.datadoghq.com/free-datadog-trial/) — so the demo works only inside a
  trial window: a trial-clock dependency on demo day.
- Local trigger: webhooks POST from Datadog's cloud (tunnel required;
  https://docs.datadoghq.com/integrations/webhooks/); the robust path is **polling
  `GET /api/v2/events`** from the runner (https://docs.datadoghq.com/api/latest/events/).
- Watchdog anomaly detection is built-in, no setup
  (https://docs.datadoghq.com/watchdog/). Strongest audience visual of the SaaS options;
  ~3–5h setup. Verdict: not worth the trial-clock risk when Grafana/Loki gives a fully
  local equivalent — mention in architecture docs as the enterprise mapping.

#### Snowflake Cortex — real, wrong-shaped

AISQL functions (`AI_CLASSIFY`, `AI_FILTER`, …), Cortex Search, Cortex Analyst are real
(https://docs.snowflake.com/en/user-guide/snowflake-cortex/aisql). Trial: 30 days/$400
credits, no card, with a ~10 credits/day Cortex cap on card-less trials
(https://docs.snowflake.com/en/user-guide/admin-trial-account, as of 2026-07-12). The
structural problem is data gravity: the signal source is a local `logs/app.log`, so the
demo would acquire a synthetic ship-logs-to-warehouse step that exists only to justify
the tool, plus 4–6h of setup — most of the tool budget. Snowflake never calls your
laptop; the runner would poll it. **Reject; it demos Snowflake, not the pipeline.**

#### Sentry — best dedup story, plan-gated where it matters

- Next.js wizard sets up capture in ~1–2h
  (https://docs.sentry.io/platforms/javascript/guides/nextjs/). Note the mismatch: the
  SDK captures **live thrown errors**, not a pre-seeded log file — planted signatures
  would need to be re-triggered live (this demo's bugs do run live, so workable).
- Fingerprint-based grouping is the best off-the-shelf dedup evaluated
  (https://docs.sentry.io/concepts/data-management/event-grouping/).
- Free Developer plan: 5k errors/mo, 1 user, API access — but **no third-party
  integrations**, so no GitHub integration; manual GitHub-issue linking needs Team
  ($26/mo), automatic issue creation needs Business ($80/mo)
  (https://sentry.io/pricing/, as of 2026-07-12;
  https://docs.sentry.io/product/integrations/source-code-mgmt/github/).
- Local trigger: poll `GET /api/0/organizations/{org}/issues/`
  (https://docs.sentry.io/api/events/list-an-organizations-issues/); webhooks assume a
  tunnel (https://docs.sentry.io/organization/integrations/integration-platform/webhooks/).
- Self-hosted Sentry needs 4 cores/16GB RAM + Kafka/ClickHouse/Redis/Postgres
  (https://develop.sentry.dev/self-hosted/) — out of scope for this budget.
- The free-tier GitHub gap actually fits the narrative ("our pipeline does the
  routing"), but it is still a SaaS seam the demo doesn't need. Optional.

#### Grafana + Loki + Alloy — the adopt pick for signaling

- **Promtail is EOL (2026-03-02)** — use Grafana Alloy
  (https://grafana.com/docs/loki/latest/send-data/promtail/).
- Alloy `loki.source.file` tails a file in real time, supports `tail_from_end`, persists
  offsets (https://grafana.com/docs/alloy/latest/reference/components/loki/loki.source.file/)
  — matches the seeded-`app.log` design exactly.
- Loki is a single container; the official docker-compose example is exactly
  Loki + Grafana + Alloy (https://grafana.com/docs/loki/latest/setup/install/docker/).
- Grafana Alerting webhook contact point POSTs a documented JSON payload to **any HTTP
  endpoint including `http://localhost:PORT`** on self-hosted Grafana
  (https://grafana.com/docs/grafana/latest/alerting/configure-notifications/manage-contact-points/integrations/webhook-notifier/)
  — the only evaluated product that natively pushes to a local script, no SaaS, no tunnel.
- Gap vs Sentry: no issue fingerprinting — dedup/routing logic stays in the runner. For
  planted, known signatures that is arguably desirable (the routing policy is the thing
  being shown, and CONTEXT.md already defines routing as deterministic policy, not AI).
- Grafana Cloud free tier exists (50GB logs/mo; https://grafana.com/pricing/) but cloud
  alerts can't reach a local runner without a tunnel — self-host instead. Setup 3–5h;
  alert evaluation granularity ~1 min (still "within minutes").

#### OpenTelemetry-native path — leanest local loop

- Collector-contrib **filelog receiver** tails and parses log files (beta for logs;
  https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/receiver/filelogreceiver/README.md).
- **filter processor** drops records by OTTL condition (alpha;
  https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/processor/filterprocessor/README.md)
  — noise filtering as config.
- **redaction processor** masks/deletes attributes (alpha for logs;
  https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/processor/redactionprocessor/README.md)
  — a one-line PII talking point.
- Export via `otlphttp` to **any local endpoint** — a ~20-line HTTP listener in the
  runner — or to Loki's native OTLP endpoint
  (https://grafana.com/docs/loki/latest/send-data/otel/). No exec-a-script exporter
  exists; the trigger is always "deliver filtered telemetry to something you run".
- One container, one YAML, ~2–3h; invisible without a dashboard on top. Named backend:
  SigNoz (MIT core, but ClickHouse+Postgres stack, 4GB Docker RAM —
  https://signoz.io/docs/install/docker/) — heavier than Loki without adding needed
  dedup; mention only.

#### Highlight.io — evaluated and rejected (good diligence story)

Acquired by LaunchDarkly 2025-04-23
(https://launchdarkly.com/blog/welcome-highlight-to-launchdarkly/); its own migration
post set hosted-service deprecation for **2026-02-28** — that date has passed. As of
2026-07-12 highlight.io serves an **expired TLS certificate** (the migration-post quotes
come from search-index copies of the first-party page at
https://highlight.io/blog/launchdarkly-migration — direct fetch fails on the cert). OSS
repo not archived but last release Aug 2025 (https://github.com/highlight/highlight).
**Reject; cite in the pitch as an evaluated-and-rejected diligence example.**

#### Microsoft Presidio — the adopt pick for PII redaction

- Analyzer (NER + regex + checksum validators) + anonymizer (replace/mask/redact),
  MIT, ~10k stars, latest release 2.2.363 on **2026-06-28** — actively maintained
  (https://github.com/microsoft/presidio).
- Governance nuance: docs/images moved to a "Data Privacy Stack" org — docs now at
  https://presidio.dataprivacystack.org/, legacy `mcr.microsoft.com/presidio-*` images
  no longer updated (https://presidio.dataprivacystack.org/installation/). Pip packages
  and the GitHub repo remain live.
- Install: `pip install presidio_analyzer presidio_anonymizer` +
  `python -m spacy download en_core_web_lg` (pre-pull the model before demo day; size
  not stated on the install page). Setup 0.5–1h; ~10 lines in the runner.
- Produces the single most demo-visible context-engineering artifact: a before/after
  log excerpt on the GitHub issue (`user=jane.doe@acme.com` → `user=<EMAIL_ADDRESS>`),
  proving the fixer agent never received raw PII. The repo's own caveat applies:
  Presidio "cannot guarantee finding all sensitive information."
- Comparables: scrubadub (Apache-2.0 but last release Sept 2023 —
  https://github.com/LeapBeyond/scrubadub); AWS Comprehend PII (SaaS, no free tier
  verifiable from https://aws.amazon.com/comprehend/); **gitleaks** (MIT, 28.1k stars,
  single binary — detects **secrets**, not PII; a cheap complementary "no secrets leaked
  to the agent" gate, https://github.com/gitleaks/gitleaks).

#### LlamaIndex / LangChain — components verified, frameworks skipped

- LlamaIndex node postprocessors exist as documented: SimilarityPostprocessor,
  CohereRerank/SentenceTransformerRerank, and both **PIINodePostprocessor** (LLM-based)
  and **NERPIINodePostprocessor** (local HF NER) — verified in current docs
  (https://developers.llamaindex.ai/python/framework/module_guides/querying/node_postprocessors/node_postprocessors/).
  MIT, healthy (v0.14.23, 2026-06-24; https://github.com/run-llama/llama_index). But
  every postprocessor operates on LlamaIndex `NodeWithScore` objects — a "thin" use
  still means wrapping log excerpts into framework nodes.
- LangChain: ContextualCompressionRetriever + EmbeddingsFilter/LLMChainFilter now live
  in `langchain-classic`
  (https://reference.langchain.com/python/langchain-classic/retrievers/document_compressors);
  the Presidio integration (`PresidioAnonymizer`) exists but lives in
  **langchain-experimental, which is being sunset** (latest 0.4.2, 2026-05-22;
  https://pypi.org/project/langchain-experimental/). Do not build on it — call Presidio
  directly.
- Verdict for both: within a 15h budget they add abstraction without adding anything
  the audience can see. Use the underlying libraries; name the frameworks in the
  architecture doc only.

#### Unstructured, promptfoo/Ragas, Notion, Linear, Paperclips (added candidates)

- **Unstructured** (OSS lib): Apache-2.0, actively maintained (v0.24.1, 2026-07-11;
  https://github.com/Unstructured-IO/unstructured); hosted API 15k pages/mo free
  (https://unstructured.io/pricing, as of 2026-07-12). But its value is messy formats
  (PDF/OCR); this repo's runbooks are markdown — adopting it means planting a PDF just
  to demo the parser, on top of a multi-GB `[all-docs]` install. **Reject.**
- **promptfoo vs Ragas** (evaluating the context step): promptfoo is MIT, local CLI +
  local web viewer, Anthropic provider support, deterministic assertions that cost
  nothing — a real demo-day fallback; note the repo states the project is "now part of
  OpenAI" while remaining open source (https://github.com/promptfoo/promptfoo;
  https://www.promptfoo.dev/pricing/). Ragas has the citable RAG metrics (faithfulness,
  context precision — https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)
  but is judge-LLM-dependent and shows terminal numbers, ~2–4h. **promptfoo optional
  (~1–2h); Ragas mention-only.**
- **Notion**: free-plan API availability **could not be conclusively verified** from
  Notion's own pages (pricing table groups "Public API" under a developer-platform
  section that reads as paid-plan-associated, while the API docs state no plan
  requirement — https://www.notion.com/pricing;
  https://developers.notion.com/docs/getting-started). Hosted MCP is OAuth-only
  (https://developers.notion.com/docs/get-started-with-mcp); 3 req/s rate limit
  (https://developers.notion.com/reference/request-limits). In-repo markdown runbooks
  beat it on every demo axis (versioned with code, visible in the public repo, zero
  auth). **Reject.**
- **Linear**: free plan includes 250 issues **and API + webhook access**
  (https://linear.app/pricing, as of 2026-07-12); GraphQL `issueCreate` with a plain
  API key (https://linear.app/developers/graphql); first-party MCP accepts API-key
  bearer auth (https://linear.app/docs/mcp); GitHub integration auto-moves issues on
  PR merge (https://linear.app/docs/github). Good theater (~2h), but it mirrors the
  system of record and every mirror is a consistency liability. **Optional; cut if
  hours are tight.**
- **Paperclips** — resolved: a real product, **Paperclip** (paperclip.ing,
  github.com/paperclipai/paperclip): MIT, self-hosted multi-agent control plane
  ("org charts, budgets, approvals"; drives Claude Code/Codex/Bash via a heartbeat
  model), ~73.4k stars but only ~4 months old (launch ~March 2026; date-versioned
  releases, latest v2026.707.0). Not the game (Universal Paperclips, 2017) and not the
  deprecated Ruby gem (https://github.com/thoughtbot/paperclip). **Real product, wrong
  scale**: it wants to own orchestration of agent *teams*; this demo has one fixer
  agent and working runner scripts. Re-platforming onto a 4-month-old orchestrator
  inside 15h is unbounded risk. **Mention as roadmap ("when there are five agents,
  this is the control plane"); do not build on it.**

---

## Question B — Prebuilt role agents / templates

### Summary table

| Option | Prompt provenance | Composes with local `claude -p` runner | Setup | Cost | GitHub artifact | Verdict |
|---|---|---|---|---|---|---|
| Anthropic official plugins (pr-review-toolkit, feature-dev) | Anthropic-authored, Apache-2.0, pushed daily | Drop-in `.claude/agents` / `/plugin install` | 15–30 min | Existing CLI auth (subscription or API key) | None native — runner posts via `gh` | **Adopt** |
| wshobson/agents | Single maintainer + community, MIT, 37.8k stars, pushed 2026-07-11 | Plugin marketplace or copy files (MIT) | 30–60 min | Same | None native | **Adopt** (debugger, test-automator) |
| VoltAgent/awesome-claude-code-subagents | Org-maintained, MIT, 23.2k stars; long, template-y prompts with cross-agent coupling to trim | Copy to `.claude/agents/` (README-sanctioned) | 30–60 min | Same | None native | Alternate source |
| hesreallyhim/awesome-claude-code | Curated link list — ships no prompts | n/a | n/a | n/a | n/a | Directory only |
| Claude Agent SDK | First-party, but a code path not a prompt source | **Replaces** the bash runner; `claude -p` is the same engine | Hours (rewrite) | API key required | None native | Reject for build; mention |
| LangGraph | No role prompts (`prompt` defaults to None) | Competing loop | Minutes + all prompts DIY | MIT free | None | Reject |
| CrewAI | Structure (role/goal/backstory), text is DIY; template library is enterprise-only; examples repo archived 2026-04-20 | Competing loop | <1h + prompts DIY | MIT free | None | Reject |
| OpenHands | Battle-tested resolver prompts, internal to its agent | Competing loop (`fix-me` label → its own PR) | 1–2h | MIT; Cloud $20 free credits | **PR + @openhands-agent iteration** | Mention (comparison baseline) |
| SWE-agent / mini-SWE-agent | SWE-bench lineage, frozen (superseded by mini-; GitHub-issue script removed 2026-01-30) | Competing loop, bench-oriented | ~1h | MIT + tokens | Local patch/trajectory only | Reject |
| Aider | Battle-tested edit prompts, no roles; releases stalled since 2025-08-09 | Shell-out secondary implementer (`aider --message --yes`) | <1h | Apache-2.0 + tokens | Local commits (runner must push/PR) | Reject / fallback mention |
| GitHub Copilot coding agent + code review | GitHub first-party, GA | Trigger via `gh` (issue assign / review request); executes in Actions cloud | 15–30 min | **Paid Copilot plan** (Pro $10/mo; free for OSS maintainers; nothing on Copilot Free) | Draft PR, Copilot commits, formal PR review | Optional (reviewer evidence) |
| CodeRabbit | Mature commercial GitHub App | Zero-trigger: auto-reviews on PR open; `@coderabbitai` re-runs via `gh` | ~15 min | **Free forever for public repos** | Summary + walkthrough + inline comments under `coderabbitai` bot | **Adopt** |
| Qodo PR-Agent (OSS CLI) | "Community-maintained legacy project of Qodo," MIT, 12k stars, pushed 2026-07-10 | **Runs locally in the runner** with own Anthropic key | 30–60 min | MIT + tokens | `/review` `/describe` `/improve` comments (under caller's identity) | Adopt-optional |
| Qodo hosted / qodo-cover | Qodo 2.0 platform; qodo-cover README: "no longer maintained" | n/a | n/a | OSS program is application-based | n/a | Reject (tester stays Claude Code) |

### Per-tool notes

#### Claude Code subagents — the official mechanism (adopt)

- Subagents are Markdown files with YAML frontmatter (`name` + `description` required;
  `tools`, `model`, `permissionMode`, `memory`, `isolation: worktree`, etc.); the body
  is the subagent's system prompt. Locations: `.claude/agents/` (project),
  `~/.claude/agents/`, `--agents <json>` (session), plugins. Hot-reloaded.
  (https://code.claude.com/docs/en/sub-agents)
- **Headless works**: all options work with `claude -p`, including `--agents <json>`
  and `--agent <name>` (run a named agent as the main session)
  (https://code.claude.com/docs/en/headless). Practical auth note: `--bare` skips
  OAuth and needs `ANTHROPIC_API_KEY`; plain `claude -p` uses normal CLI login
  (subscription included).
- Pipeline pattern that fits `run.sh` today: one `claude -p --agent <role>` call per
  stage — each stage's JSONL transcript is then purely that role's, which is cleaner
  demo evidence than in-session delegation — with the runner posting each role's output
  as an attributed comment via `gh issue comment` / `gh pr review`.
- **Nothing in this ecosystem posts to GitHub natively.** Role attribution on the
  PR is the runner's job (`gh` + a role header, or `git commit --author`). Anthropic's
  native post-to-PR path is `anthropics/claude-code-action`, which is GitHub Actions —
  explicitly avoided by this design (https://github.com/anthropics/claude-code-action).

#### Prompt sources, ranked by provenance

1. **Anthropic official plugins** — `anthropics/claude-plugins-official` (Apache-2.0,
   32k stars, pushed 2026-07-12; https://github.com/anthropics/claude-plugins-official;
   announcement https://www.anthropic.com/news/claude-code-plugins). Verified role
   agents by reading the files: `pr-review-toolkit` ships six reviewer agents
   (`code-reviewer.md` model: opus, tuned to "minimize false positives";
   `pr-test-analyzer.md`; `silent-failure-hunter.md`; …); `feature-dev` ships
   `code-architect.md` (planner: implementation blueprints, read-only tools). Prompts
   are short and sharp (34–69 lines). **Gap: no dedicated implementer or debugger**
   (the main loop is the implementer). Note: `anthropics/claude-plugins` and
   `anthropics/claude-code-plugins` do not exist (verified 404).
2. **wshobson/agents** — now a plugin marketplace of 88 plugins, MIT, 37,830 stars,
   pushed 2026-07-11 (https://github.com/wshobson/agents). All five roles present and
   substantive: `comprehensive-review/agents/code-reviewer.md` (171 lines),
   `debugging-toolkit/agents/debugger.md`, `test-automator.md` (in six plugins),
   `architect-review.md`, plus orchestration plugins. Fills Anthropic's
   debugger/tester gap.
3. **VoltAgent/awesome-claude-code-subagents** — 100+ standalone agent files by
   category, MIT, 23,220 stars, pushed 2026-07-10
   (https://github.com/VoltAgent/awesome-claude-code-subagents). Quality check: files
   are long (286-line `code-reviewer.md`) but checklist-heavy and somewhat
   template-generated; several open with "Query context manager…" — a coupling to
   VoltAgent's own orchestration agents that needs trimming. Usable second source.
4. **hesreallyhim/awesome-claude-code** — a curated **link list** (49.8k stars,
   license "other"); ships no agent files itself
   (https://github.com/hesreallyhim/awesome-claude-code). Directory, not a source.
5. Others checked: iannuttall/claude-agents **archived**; dl-ezo/claude-code-sub-agents
   **no license** (can't reuse); 0xfurai/claude-code-subagents ~9 months stale,
   language-specialists not roles. Skip all three.

#### Claude Agent SDK — same engine, unnecessary rewrite

TypeScript `@anthropic-ai/claude-agent-sdk` / Python `claude-agent-sdk`; programmatic
`agents` option mirrors frontmatter; in-process hooks; loads the same `.claude/agents/`
files (https://code.claude.com/docs/en/agent-sdk/overview). The headless docs frame
`claude -p` as "the Agent SDK via the CLI" — the bash runner already has the documented
equivalent. SDK docs instruct API-key auth and note third-party products may not offer
claude.ai login. **Verdict: keep `claude -p`; mention the SDK as the growth path.**

#### General frameworks — verified: no role prompts ship anywhere

- **LangGraph**: MIT, very active (v1.2.9, 2026-07-10;
  https://github.com/langchain-ai/langgraph), but `create_react_agent`'s `prompt`
  defaults to `None` — "no additional system-level instructions are automatically
  prepended" — and it is deprecated in favor of `create_agent`
  (https://reference.langchain.com/python/langgraph.prebuilt/chat_agent_executor/create_react_agent).
  Official templates contain one generic system prompt, no roles
  (https://github.com/langchain-ai/react-agent). You'd rebuild Claude Code's loop and
  still write every prompt.
- **CrewAI**: MIT, active (v1.15.2, 2026-07-08; https://github.com/crewAIInc/crewAI);
  `role`/`goal`/`backstory` text is developer-authored — the framework interpolates it
  into a generic template (https://docs.crewai.com/en/concepts/agents). The
  "pre-configured agent types" library is a **Visual Agent Builder enterprise
  feature**; the examples repo was **archived 2026-04-20**
  (https://github.com/crewAIInc/crewAI-examples). Same verdict.
- **OpenHands**: MIT (except `enterprise/`), 80.5k stars, very active
  (https://github.com/All-Hands-AI/OpenHands); now a "self-hosted developer control
  center" that can also drive Claude Code. Its resolver (apply `fix-me` label → it
  opens a PR; iterate via `@openhands-agent` comments) natively produces exactly the
  desired GitHub evidence (https://docs.openhands.dev/usage/how-to/github-action) —
  but as a **competing full agent loop**: adopting it replaces the Claude Code fixer.
  Cloud gives $20 free credits (https://www.openhands.dev/pricing). Mention as a
  comparison baseline only.
- **SWE-agent**: frozen — last release 2025-05-22 and the repo says development moved
  to mini-swe-agent (https://github.com/SWE-agent/SWE-agent). mini-swe-agent is active
  but removed its GitHub-issue run script on 2026-01-30 (verified via commit history;
  the old doc URL 404s) — artifacts are local patches/trajectories, nothing on GitHub
  (https://github.com/SWE-agent/mini-swe-agent). Reject.
- **Aider**: Apache-2.0, first-class scripting (`aider --message --yes`, auto-commits;
  https://aider.chat/docs/scripting.html) — the best shell-out secondary-implementer
  story — but releases stalled at v0.86.0 (2025-08-09) with only sparse model-list
  commits since (https://github.com/Aider-AI/aider). Duplicates the implementer role;
  fallback mention only.

#### PR-visible reviewers: CodeRabbit, Copilot, Qodo PR-Agent

- **CodeRabbit (adopt)**: pricing page states verbatim — "install CodeRabbit on a
  public repository, and receive free reviews forever for public repositories"
  (https://www.coderabbit.ai/pricing, as of 2026-07-12). GitHub App install ~15 min
  (https://docs.coderabbit.ai/getting-started/quickstart). Auto-reviews on PR open
  (`reviews.auto_review.enabled` default true). **Demo-critical gotchas, verified in
  the configuration reference** (https://docs.coderabbit.ai/reference/configuration):
  `auto_review.drafts` defaults **false** — draft PRs are silently skipped (run.sh
  must open ready PRs, which it does); `ignore_usernames` defaults empty, and no doc
  states bot-authored PRs are skipped — but test once if PR authorship ever moves to
  an App token. Artifacts: summary + walkthrough + inline comments under the
  `coderabbitai` bot identity, "within minutes" per the quickstart. OSS-plan rate
  limits are stated to exist but exact numbers unpublished
  (https://docs.coderabbit.ai/faq). Hard SaaS dependency — but zero moving parts on
  our side; the demo degrades gracefully if it's down (the PR still exists).
- **GitHub Copilot coding agent** ("Copilot cloud agent"): first-party; triggered by
  assigning an issue to Copilot (a plain `gh` API call — the local runner *can*
  trigger it), executes in GitHub Actions, leaves a draft PR + Copilot-authored
  commits + session logs
  (https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent).
  Requires a **paid** Copilot plan (Pro $10/mo; free for verified OSS maintainers;
  not on Copilot Free — https://docs.github.com/en/copilot/get-started/plans).
  Copilot code review posts a formal PR review as `Copilot`, also paid-plan-gated
  (https://docs.github.com/en/copilot/concepts/agents/code-review). Conflicts with
  the local-runner story for the fixer role; optional as a *second reviewer* artifact
  if a paid plan is already owned.
- **Qodo PR-Agent (OSS CLI)**: MIT, 12,060 stars, pushed 2026-07-10, but README now
  labels it a "community-maintained legacy project of Qodo"
  (https://github.com/qodo-ai/pr-agent). Runs **locally**:
  `pip install pr-agent && pr-agent --pr_url <url> review`, Anthropic models via
  LiteLLM config (verified in `docs/docs/usage-guide/changing_a_model.md`). Artifacts:
  `/describe`, `/review` (structured review comment), `/improve` (committable
  suggestions) — under the caller's token identity, so mint a machine account if
  distinct actor optics matter. No `/test` tool in OSS; **qodo-cover is officially
  unmaintained** ("This repository is no longer maintained" —
  https://github.com/qodo-ai/qodo-cover), and Qodo's hosted OSS program is
  application-based, not automatic (https://www.qodo.ai/pricing/). So the tester role
  stays a Claude Code agent. PR-Agent is the only reviewer here that runs inside the
  local-runner design — worth 30–60 min if a second, locally-controlled reviewer
  artifact is wanted alongside CodeRabbit.

---

## Question C — Agent-session trace / observability UI

Goal: show the fixer agent's session (tool calls, diffs, timeline) to the audience,
during or after a run, with minimal build time. The pipeline already saves each run's
full Claude Code transcript as JSONL (`harness/private/transcript-issue-<n>.jsonl`).
Baseline alternative: a hand-built local trace page (~1h).

### Summary table

| Option | What audience sees | License/free tier | Setup | Fragility | Fit with run.sh + JSONL design | Verdict |
|---|---|---|---|---|---|---|
| daaain/claude-code-log | Static HTML render of a transcript: prompts, responses, tool calls; also Markdown/TUI | MIT; 1.1k stars; release 1.5.0, pushed 2026-07-10 | **~15 min** (`uvx claude-code-log <file>`) | None — offline, zero services | **Consumes the exact saved artifact at an arbitrary path** | **Adopt** |
| simonw/claude-code-transcripts | Paginated HTML with a timeline index of prompts + commits | Apache-2.0; 1.6k stars; v0.6 Jan 2026 | ~15 min | None | Arbitrary files supported; commit-timeline suits a bug-fix narrative | Alternate |
| Zed + claude-agent-acp (ACP) | Real editor agent panel: expandable tool calls, Review Changes diff tab, thread history | Apache-2.0 (protocol + adapter); Zed free | ~1h to validate | Medium — needs Zed + adapter auth; replays the **live session store**, not the saved copy; unverified end-to-end | No run.sh re-plumbing needed in principle (see notes) | Optional showpiece |
| delexw/claude-code-trace / d-kimuson/claude-code-viewer | Live tail / local web app with tool-call components | MIT; 347 / 1.2k stars, both active 2026 | ~15–30 min | Low | **Read `~/.claude/projects` only** — not the saved JSONL copy | Mention |
| badlogic claude-trace (lemmy) | Self-contained HTML from an API-traffic proxy recording | Part of badlogic/lemmy monorepo | ~30 min | Requires launching claude *through* the wrapper — changes run.sh | Doesn't read existing JSONL | Reject |
| Langfuse | Cloud/self-host trace waterfalls | MIT core; cloud Hobby 50k units/mo free (2026-07-12) | Hours | Cloud dependency, or Postgres+ClickHouse+Redis+MinIO self-host; Claude Code trace export is **beta** | Wrong shape (fleet monitoring, not single-run replay) | **Reject** |
| Hand-built trace page | Whatever we build | — | ~1h | None | Native | Superseded by claude-code-log |

### Notes

#### ACP (Agent Client Protocol) and Zed — verified mechanism, one live-test caveat

- ACP is a JSON-RPC "LSP for agents" protocol created by Zed, now in a neutral org
  (`agentclientprotocol/agent-client-protocol`, Apache-2.0, schema v1.19.0 2026-07-06;
  https://agentclientprotocol.com/overview/introduction; https://zed.dev/acp). Clients:
  Zed, JetBrains, VS Code, Neovim, Emacs, and more; 40+ agents including Claude Agent,
  Gemini CLI, Copilot (https://agentclientprotocol.com/overview/agents).
- The spec defines `session/load` (gated by a `loadSession` capability): the agent
  "MUST replay the entire conversation to the Client"
  (https://agentclientprotocol.com/protocol/session-setup).
- The Claude Code adapter (`zed-industries/claude-code-acp`, now
  `agentclientprotocol/claude-agent-acp`; Apache-2.0, v0.58.1 2026-07-09) implements
  both `loadSession` (replays stored history, then resumes the SDK session) and
  `listSessions` over **Claude Code's own session store** (`~/.claude/projects`,
  keyed by cwd) — verified by reading `src/acp-agent.ts`.
- **The critical question — can a headless `claude -p` run be replayed in Zed? Yes in
  principle**: `claude -p` sessions persist in the same store and are resumable
  (https://code.claude.com/docs/en/headless), the adapter enumerates that store, and
  Zed "can import existing threads from configured External Agents" into its Thread
  History (https://zed.dev/docs/ai/external-agents). No re-plumbing of run.sh needed.
- Caveats: (a) replay targets the **live session store** — the saved
  `harness/private/*.jsonl` copy is not loadable, so the store entry must still exist;
  (b) breaks if run.sh ever adopts `--bare` or the store is wiped; (c) Zed's docs hedge
  that history/restore "depend on the agent integration", and this mechanism was
  verified from spec + adapter source + docs but **not executed** — budget ~1h to
  validate before trusting it live.

#### Transcript viewers — the buy that replaces the build

- **daaain/claude-code-log** (adopt): `pip install claude-code-log` or
  `uvx claude-code-log transcript.jsonl` → static HTML with chronological
  prompts/responses/tool calls, plus Markdown and TUI modes; MIT, 1.1k stars, release
  1.5.0, pushed 2026-07-10 (https://github.com/daaain/claude-code-log). The only
  well-maintained viewer that takes a JSONL file at an **arbitrary path** — the exact
  artifact `run.sh` already saves. Fully offline. This replaces the ~1h hand-built
  trace page with ~15 minutes of integration.
- **simonw/claude-code-transcripts**: also accepts arbitrary files/URLs, adds a
  timeline-of-commits index (nice for a bug-fix narrative) and optional Gist
  publishing; Apache-2.0, v0.6 Jan 2026 — slightly less fresh
  (https://github.com/simonw/claude-code-transcripts).
- **Live-view options** (mention only): delexw/claude-code-trace (live tailing,
  expandable tool calls, v0.11.0 2026-07-10;
  https://github.com/delexw/claude-code-trace) and d-kimuson/claude-code-viewer
  (local web app, resume sessions; https://github.com/d-kimuson/claude-code-viewer) —
  both read `~/.claude/projects` only, not the saved copy.
- **ccusage** (https://github.com/ccusage/ccusage) is usage/cost analytics, not a
  transcript viewer — different tool class.

#### Langfuse — reject for this demo

MIT core (except `ee/`), 31k stars; cloud Hobby tier 50k units/mo free
(https://langfuse.com/pricing, as of 2026-07-12); self-host is a
Postgres+ClickHouse+Redis+MinIO stack (https://github.com/langfuse/langfuse). Claude
Code's OTel export covers metrics/logs stably, but **full trace spans are beta**
(`CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`;
https://code.claude.com/docs/en/monitoring-usage), and Langfuse ingests OTLP traces
only, HTTP not gRPC (https://langfuse.com/integrations/native/opentelemetry) — whether
the beta spans render usefully is not verifiable from either party's docs. Effort and
fragility exceed the 1h hand-built baseline for a single-run replay; right tool for
fleet monitoring, wrong shape here.

---

## Question D — Agent-driven browser/UI automation of the localhost app

Use case: a tester/debugger agent drives the locally-running Next.js app in a real
browser — reproduces the bug's visible symptom before the fix, verifies after, and
leaves screenshot/recording evidence on the PR — without hand-written UI scripts.

Composition fact settled first: Claude Code's non-interactive mode loads MCP servers
like any session — project `.mcp.json` is picked up automatically, or pass
`--mcp-config`; in `--bare` mode MCP loads **only** via `--mcp-config`; MCP tools still
need `--allowedTools`/permission rules to run unprompted
(https://code.claude.com/docs/en/headless). So any MCP server drops into `run.sh`'s
fixer/tester session with config only; agent-loop libraries do not.

### Summary table

| Tool | Composes with headless `claude -p` | Determinism risk | PR artifact | Setup (localhost) | License/cost (2026-07-12) | Verdict |
|---|---|---|---|---|---|---|
| Playwright MCP (microsoft/playwright-mcp) | **Native MCP** — one config line | Lowest of AI options (accessibility tree + auto-waiting; residual risk is LLM element choice) | Screenshots via `browser_take_screenshot`; tracing/video capability listed | <1h (`npx @playwright/mcp@latest`) | Apache-2.0, free; MS-maintained, ~35k stars, v0.0.78 Jul 2026 | **Adopt** |
| Chrome DevTools MCP (Google) | Native MCP | Low; adds console/network/perf-trace depth — useful for "reproduce the symptom" | Screenshots, performance traces | <1h | Apache-2.0, free; ~46.7k stars, v1.5.0 2026-07-03 | Alternate (Chrome-only) |
| OpenCLI (jackwener/opencli) | Via Bash + shipped Claude Code skill (not MCP); needs daemon + Chrome extension | Deterministic by design (structured DOM commands, no runtime tokens) | `screenshot` command | 0.5–1h incl. extension/daemon | Apache-2.0, free; ~26.5k stars, v1.8.6 Jul 2026, single-author | Mention |
| browser-use | Competing agent loop (nested agent, double token spend) | Highest — inner LLM re-plans every run | `generate_gif` run recordings (genuinely nice) | <1h lib, glue is the cost | MIT; 104k stars, v0.13.4 2026-07-11 | Reject for demo |
| Stagehand (Browserbase) | Library for scripts Claude would write (LOCAL mode needs no Browserbase account — verified) | Middle (Playwright skeleton, LLM-resolved steps) | Screenshots | ~1h + script time | MIT, free local; 23.5k stars | Reject for demo |
| Skyvern | No MCP path verified; own server+API | Vision-LLM driven; repo cites 64.4% WebBench — not demo-grade | Recordings (unverified detail) | Heaviest (server, docker) | **AGPL-3.0** | **Reject** |
| Anthropic computer use | Not exposed in Claude Code; separate quickstart agent loop | Slowest/flakiest (pixel loop; docs have a click-accuracy troubleshooting section) | Raw loop screenshots | ~1h demo container + real integration build | Beta headers (`computer-use-2025-11-24`); API tokens per screenshot | **Reject** |
| Plain Playwright tests (baseline) | n/a — deterministic scripts | None | Best-in-class: trace.zip (Trace Viewer), video, screenshots (https://playwright.dev/docs/trace-viewer-intro) | Hand-written per bug — the thing to avoid | Apache-2.0 | Baseline / hybrid |

### Notes

- **"opencli" resolved**: two unrelated things share the name. `sindresorhus/open-cli`
  (npm) merely opens URLs/files from the terminal — no agent relevance
  (https://github.com/sindresorhus/open-cli). The intended tool is almost certainly
  **OpenCLI (jackwener/opencli)** — "Make Any Website into CLI & use your logged-in
  browser by AI agent": a local daemon + Chrome "Browser Bridge" extension speaking
  CDP to an already-logged-in Chrome, exposing deterministic commands (`open`,
  `click`, `fill`, `extract`, `screenshot`, …) and 90+ site adapters, with installable
  Claude Code skills; Apache-2.0, ~26.5k stars, v1.8.6 Jul 2026
  (https://github.com/jackwener/opencli). Credible and active — but its
  differentiators (logged-in sessions, site adapters, token-free scripting) solve
  problems an unauthenticated localhost app doesn't have, and it adds two moving
  parts (daemon + extension) where Playwright MCP adds none.
- **Playwright MCP** exposes the browser as **accessibility-tree snapshots** rather
  than pixels — no vision round-trips, element-reference clicks, auto-waiting; 50+
  tools including `browser_snapshot`, `browser_click`, `browser_take_screenshot`,
  form filling, network mocking, tracing and video; `--headless` and
  `--allowed-origins` to fence it to the demo app
  (https://github.com/microsoft/playwright-mcp). Attach:
  `claude mcp add playwright npx @playwright/mcp@latest` or `.mcp.json`.
- **Hybrid worth naming in the doc**: the tester agent (via Playwright MCP)
  *generates* a plain Playwright script per bug as a by-product; the live demo then
  replays deterministically with Playwright's own trace/video artifacts.
- **PR-artifact constraint (hard, verified)**: `gh` CLI **cannot upload images** to
  PR/issue comments — no public API for GitHub's attachments CDN (long-standing,
  closed as platform-blocked: https://github.com/cli/cli/issues/1895;
  https://github.com/cli/cli/discussions/4745). The reliable pattern: **commit
  evidence to the PR branch** (e.g. `evidence/issue-<n>/before.png`) and embed via
  raw.githubusercontent/relative URLs in the PR body — pure git + `gh`.
- **Computer use** remains beta (`computer-use-2025-11-24` header for current models,
  zoom action for small text), is billed a screenshot per step, and its own docs
  troubleshoot click accuracy at length
  (https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool;
  reference impl
  https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo).
  Wrong tool for a web app you control.
- The old **Puppeteer MCP** reference server is archived with an explicit
  no-security-updates notice
  (https://github.com/modelcontextprotocol/servers-archived/tree/main/src/puppeteer).
  Do not use.

---

## Recommended stack

The tooling envelope is ~4–7h of the 15h total. The stack below puts a **core of
~4.5–5.5h** on the highest evidence-per-hour tools, then a ranked stretch list to
fill toward 7h. Everything else is mention-only (named in architecture docs as the
enterprise mapping or roadmap) or rejected.

### Adopt — core (~4.5–5.5h)

| Tool | Hours | What it witnesses / leaves behind |
|---|---|---|
| **CodeRabbit** (GitHub App) | 0.5 | Automated reviewer artifact — summary, walkthrough, inline comments under the `coderabbitai` bot on every PR the runner opens. Free forever on public repos. Config gotcha: PRs must be opened ready (drafts are skipped by default) — `run.sh` already opens ready PRs. |
| **daaain/claude-code-log** | 0.5 | Trace UI for every fixer run: `uvx claude-code-log harness/private/transcript-issue-<n>.jsonl` → static HTML with expandable tool calls. Replaces the planned ~1h hand-built trace page. |
| **Microsoft Presidio** redaction step in `run.sh` | 1.0 | Context engineering made visible: log excerpt redacted before agent handoff; before/after block posted to the GitHub issue. Pre-download `en_core_web_lg` at setup, not demo time. |
| **Role agents** vendored into `.claude/agents/` | 1.5–2.0 | Reviewer + test-analyzer + planner from Anthropic's `pr-review-toolkit`/`feature-dev` (Apache-2.0), debugger + test-automator from wshobson/agents (MIT). Runner invokes `claude -p --agent <role>` per stage and posts each role's output as an attributed issue/PR comment via `gh` — role-authored artifacts with per-role transcripts. |
| **Playwright MCP** for the tester role | 1.0 | Tester agent reproduces the symptom in a real browser and verifies the fix; screenshots **committed to the PR branch** (`evidence/…`) and embedded in the PR body — `gh` cannot upload images to comments. |

### Stretch — in priority order, up to the 7h ceiling

1. **Grafana + Loki + Alloy** (3–4h): the signaling showpiece — Alloy tails
   `logs/app.log`, dashboard shows the planted signature firing, Grafana alert
   webhook POSTs to a localhost endpoint that (in the fiction) feeds the routing
   policy. Fully local, zero SaaS. If hours run out, the fallback is narrating the
   runner's existing grep-based detection over the seeded log — the OTel Collector
   path (2–3h) buys headless filtering but nothing visible.
2. **Local reranker context-selection table** (1h): mxbai-rerank-base-v2 or
   bge-reranker-v2-m3 (both Apache-2.0, offline) scores candidate files/log excerpts;
   the scored table is posted to the issue before the fixer runs.
3. **Zed ACP replay validation** (1h gate): if the headless session replays cleanly
   in Zed's agent panel, it upgrades the trace story from static HTML to a live
   editor panel; if the 1h gate fails, keep claude-code-log and move on.
4. **promptfoo** (1–2h): assertion matrix over the context-construction step, local
   web viewer, deterministic-assertion fallback needs no network.

### Mention-only (architecture docs / pitch narrative, no build hours)

- **Datadog** — the enterprise mapping of the Grafana/Loki role; free plan has no
  logs/Error Tracking, demo would ride a 14-day trial clock.
- **Sentry** — best-in-class dedup/fingerprinting to cite; free tier lacks GitHub
  integration and webhooks need a tunnel; polling works if ever needed.
- **OpenTelemetry Collector / SigNoz** — the vendor-neutral pipeline vocabulary
  (filelog receiver, filter processor, redaction processor).
- **Voyage AI rerank-2.5** (MongoDB-owned; 200M free tokens) and **Cohere Rerank 4.0**
  — the hosted reranking mapping; Anthropic has no first-party reranker (its docs
  say so).
- **Claude Agent SDK** — the growth path when the bash runner needs structured
  events/hooks; `claude -p` is the same engine today.
- **OpenHands resolver** — a competing full loop; citable as the
  label-triggered-PR comparison baseline.
- **GitHub Copilot coding agent / code review** — first-party but paid-plan-gated
  and Actions-cloud-executed; optional second reviewer if a Pro plan exists.
- **Qodo PR-Agent (OSS CLI)** — the locally-runnable reviewer alternative
  (MIT + Anthropic key) if a non-SaaS reviewer artifact is ever required.
- **Paperclip** (paperclip.ing) — real MIT multi-agent control plane, ~4 months old;
  roadmap line: "when there are five agents, this is the control plane."
- **Chrome DevTools MCP** — the debugging-depth alternative to Playwright MCP.
- **OpenCLI** (jackwener/opencli) — real and deterministic-by-design; its
  logged-in-browser architecture pays off on third-party sites, not localhost.
- **Ragas** — citable context-precision/faithfulness vocabulary; heavier and less
  visible than promptfoo.
- **Linear** — cheapest high-polish add-on (~2h, free plan includes API) but mirrors
  the system of record; cut unless hours are spare and the mirror caveat is accepted.

### Rejected (with the reason)

- **Upside (upside.tech)** — GTM revenue-attribution platform; zero
  signaling/observability surface. The "AI GTM company" belief was accurate as a
  description of the company, irrelevant as a tool lead.
- **Highlight.io** — hosted product sunset 2026-02-28 after the LaunchDarkly
  acquisition; vendor domain serving an expired TLS cert; OSS releases stale.
- **Snowflake Cortex** — data gravity wrong (local log → cloud warehouse step exists
  only to justify the tool); 4–6h setup; trial clock.
- **Mixedbread hosted / Jina rerank** — no permanent free tier ($5 one-time) /
  CC-BY-NC weights; local Apache-2.0 weights win.
- **LlamaIndex / LangChain as pipeline** — verified components, but abstraction tax
  with nothing audience-visible; LangChain's Presidio wrapper lives in a sunset
  package.
- **Unstructured** — solves messy-format parsing this repo doesn't have; adopting it
  means planting a PDF to manufacture the problem.
- **Notion** — free-plan API access unverifiable from Notion's own pages; in-repo
  markdown beats it on every demo axis.
- **Paperclips as build target** — one-agent pipeline doesn't need a team-of-agents
  control plane; re-platforming risk on a 4-month-old codebase.
- **LangGraph / CrewAI** — no role prompts ship (verified); competing loops; the
  prompt-writing burden they were meant to remove stays.
- **SWE-agent / mini-SWE-agent** — frozen/superseded; GitHub-issue entry point
  removed; local-patch artifacts only.
- **Aider** — releases stalled since 2025-08-09; duplicates the implementer role.
- **qodo-cover** — README: "no longer maintained"; the tester role stays a Claude
  Code agent.
- **Skyvern** — AGPL, heavy server, vision-LLM reliability below demo grade.
- **browser-use / Stagehand** — nested agent loop / reintroduces script-writing;
  both fine products, wrong composition with a Claude Code runner.
- **Anthropic computer use** — beta, pixel-based, screenshot-billed, click-accuracy
  caveats in its own docs; redundant when the app under test is yours.
- **Langfuse** — fleet-monitoring shape; Claude Code trace-span export still beta;
  heavier than the 1h hand-built baseline it would replace.
- **badlogic claude-trace** — requires wrapping the `claude` invocation; doesn't
  read the already-saved JSONL.
- **Sentry self-hosted** — 16GB-RAM multi-service stack; out of scope.
- **Puppeteer MCP** — archived, explicitly unmaintained.

### Demo-day gotcha checklist (verified facts that bite)

1. CodeRabbit skips **draft** PRs by default (`reviews.auto_review.drafts: false`).
2. `gh` cannot attach images to PR comments — commit evidence to the PR branch.
3. Pre-download all local models (spaCy `en_core_web_lg`, reranker weights,
   Playwright browsers) during setup; demo day must not download anything.
4. Promtail is EOL (2026-03-02) — any Loki config must use Alloy.
5. Plain `claude -p` (non-bare) uses CLI login/subscription; `--bare` requires
   `ANTHROPIC_API_KEY` and loads MCP only via `--mcp-config`.
6. Zed/ACP replay depends on the live `~/.claude/projects` session store — don't
   wipe it between run and show-and-tell, and validate once before trusting it.
