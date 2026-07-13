# Runbook: investigating a reported API misbehavior

Use this when someone reports the Tasks app doing the wrong thing — a task
that vanished, an update that didn't stick, a list showing the wrong items.
The app is small and deliberately boring; almost every report can be resolved
by reading the log, replaying the request with curl, and writing a failing
test at the route-handler seam.

## 1. Start with the log

The app writes structured NDJSON logs via pino to `logs/app.log` (override
with `LOG_FILE`). One JSON object per line. Every line carries the pino base
fields plus the request context:

| Field      | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `level`    | numeric pino level: `30` = info, `40` = warn, `50` = error     |
| `time`     | epoch milliseconds                                             |
| `pid`, `hostname` | process identity                                        |
| `reqId`    | per-request id (8 chars), same on every line of one request    |
| `method`   | HTTP method                                                    |
| `route`    | route pattern, e.g. `/api/tasks` or `/api/tasks/:id`           |
| `msg`      | short human-readable event name                                |

Event-specific fields ride alongside, never inside `msg`. The events each
handler emits:

| Route                | Event (`msg`)                     | Level | Extra fields          |
| -------------------- | --------------------------------- | ----- | --------------------- |
| `GET /api/tasks`     | `listed tasks`                    | info  | `status`, `count`     |
| `POST /api/tasks`    | `creating task`                   | info  | `payload`             |
| `POST /api/tasks`    | `create rejected: missing title`  | warn  |                       |
| `POST /api/tasks`    | `task created`                    | info  | `taskId`              |
| `PATCH /api/tasks/:id` | `updating task`                 | info  | `taskId`, `payload`   |
| `PATCH /api/tasks/:id` | `task not found`                | warn  | `taskId`              |
| `PATCH /api/tasks/:id` | `task update failed validation` | error | `err`, `taskId`       |
| `PATCH /api/tasks/:id` | `task updated`                  | info  | `taskId`              |

Useful first passes:

```bash
# anything above info in the whole log
jq -c 'select(.level >= 40)' logs/app.log

# the last 20 events on the PATCH route
jq -c 'select(.route == "/api/tasks/:id")' logs/app.log | tail -20

# make the timestamps readable
jq -c '.time |= (. / 1000 | todate)' logs/app.log | tail -20
```

## 2. Correlate the request with reqId

`requestLogger()` (in `lib/logger.ts`) stamps a fresh `reqId` onto a child
logger at the top of each handler, so every line a single request produced
shares one id. When you find a suspicious line, pull the whole request:

```bash
jq -c 'select(.reqId == "97vhj2zl")' logs/app.log
# or, quick and dirty:
grep 97vhj2zl logs/app.log
```

Reading a request's lines in order tells you what the handler saw
(`payload`), what it decided (warn/error events), and what it claims it did
(`taskId`, `count`). Compare that against what the reporter says happened —
the gap between the two is usually the diagnosis.

Note that `payload` is logged verbatim on create and update, so the log shows
exactly what the client sent, not what the handler kept.

## 3. Map the route to its handler

Next.js App Router: the file path *is* the route.

| Route pattern          | Handler file                    | Exports        |
| ---------------------- | ------------------------------- | -------------- |
| `GET, POST /api/tasks` | `app/api/tasks/route.ts`        | `GET`, `POST`  |
| `PATCH /api/tasks/:id` | `app/api/tasks/[id]/route.ts`   | `PATCH`        |
| the page itself        | `app/page.tsx` (client component) | —            |

The handlers are thin: parse input, read the store, mutate, write, respond.
Shared pieces live in `lib/`: domain types (`lib/tasks.ts`), the zod schema
(`lib/validation.ts`), persistence (`lib/store.ts`), logging
(`lib/logger.ts`).

## 4. Reproduce with curl

Run the dev server (`npm run dev`, port 3000), then replay the reported
interaction directly against the API — the UI adds a layer you usually don't
need:

```bash
# list (the UI's three tabs are these three calls)
curl -s localhost:3000/api/tasks | jq
curl -s 'localhost:3000/api/tasks?status=active' | jq
curl -s 'localhost:3000/api/tasks?status=done' | jq

# create
curl -s -X POST localhost:3000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"repro task","dueDate":"2026-08-01"}' | jq

# update (id from the create response)
curl -s -X PATCH localhost:3000/api/tasks/<id> \
  -H 'Content-Type: application/json' \
  -d '{"completed":true}' | jq
```

Each call appends to `logs/app.log`, so `tail -f logs/app.log | jq -c .` in a
second terminal shows you the handler's view of your repro as you drive it.

## 5. Check what actually persisted

Tasks live in a single JSON file, `data/tasks.json` by default (`TASKS_FILE`
overrides). `lib/store.ts` reads and writes the whole array — there is no
cache and no database, so the file is the truth:

```bash
jq . data/tasks.json
```

Diff what's in the file against what the API returned and against what the
reporter expected. A response can look fine while the file tells a different
story, and vice versa; knowing which side is wrong halves the search space.
(Fresh checkouts get realistic content via `node scripts/seed.mjs` against a
running dev server.)

## 6. Write the regression test before the fix

The suite is Vitest against the route handlers, run with `npm test`
(`npm run lint` for ESLint). Conventions, per `tests/api/tasks.test.ts`:

- Import the handlers directly (`GET`/`POST` from `app/api/tasks/route.ts`,
  `PATCH` from `app/api/tasks/[id]/route.ts`) and call them with real
  `Request` objects. No HTTP server, no mocking of `lib/` internals.
- The dynamic-segment handler takes params as a promise:
  `PATCH(req, { params: Promise.resolve({ id }) })`.
- Isolation via the store seam: `beforeEach` points `TASKS_FILE` at a fresh
  temp directory, so every test starts from an empty store and builds its own
  state through the API. The logger is disabled under `NODE_ENV=test`.
- Group by endpoint (`describe("PATCH /api/tasks/:id", ...)`) and assert
  external behavior only: response status, response body, and what a
  subsequent `GET` returns — never implementation details.

For a bug fix, first encode the reported behavior as a test that fails for
the reported reason, then fix, then watch it pass. A fix without a red-first
test is a fix you can't prove.

## Quick checklist

1. Find the reported moment in `logs/app.log`; pull the full request by
   `reqId`.
2. Read the handler the `route` field points at.
3. Reproduce with curl; watch the log and `data/tasks.json` while you do.
4. Write the failing route-handler test.
5. Fix with the smallest change that makes it pass; run `npm test` and
   `npm run lint`.
