# Coding standards — Tasks

Short, and enforced by review. When a rule and the code disagree, fix one of
them in the same PR.

## TypeScript

- `strict` is on in `tsconfig.json` and stays on. No `any`, no `@ts-ignore`
  without a comment saying why.
- Shared domain shapes live in `lib/tasks.ts` (`Task`, `TaskPatch`) and are
  imported everywhere else — handlers and UI never redeclare them.
- Use `import type` for type-only imports and the `@/` path alias instead of
  relative `../..` chains.

## API handlers

- Handlers stay thin: parse input, log, read the store, mutate, write,
  respond. Anything shared belongs in `lib/`.
- Validate at the boundary. The persisted task shape is guarded by the zod
  schema in `lib/validation.ts`; input a handler can't accept is rejected
  with a 4xx and a `warn` log, and nothing invalid is written to the store.
- Responses are `Response.json(...)` with an explicit status when it isn't
  200: `201` on create, `400` on bad input, `404` on unknown id. Error bodies
  are `{ error: "human-readable reason" }`.

## Persistence

- All task I/O goes through `lib/store.ts` (`readTasks`/`writeTasks`);
  nothing else touches `data/tasks.json`. The file path is only ever resolved
  via `TASKS_FILE` so tests can redirect it.
- The store is read-modify-write on the whole array. Keep it that way until
  it hurts — no caching layer, no partial writes.

## Logging

- pino, NDJSON, via `lib/logger.ts` only. Every handler opens with
  `requestLogger(method, route)` and logs through that child so each line
  carries `reqId`, `method`, and `route`; never log with the bare logger
  inside a request.
- Levels: `info` for each meaningful step with its outcome fields (`count`,
  `taskId`, `payload`); `warn` for rejected input and missing resources;
  `error` for failures, always with the `err` object attached.
- `msg` is a short, stable verb phrase (`"task created"`); data goes in
  fields, never interpolated into the message. Grep-ability is the point.

## Testing

- Vitest, at the route-handler seam: import the handler, call it with a real
  `Request`, assert on the response and on what a subsequent `GET` shows.
  No mocking of `lib/` internals, no assertions on implementation detail.
- Tests isolate state by pointing `TASKS_FILE` at a fresh temp dir in
  `beforeEach` and building their own fixtures through the API.
- Every bug fix ships with a regression test that failed for the reported
  reason before the fix. Purely presentational changes — where no API route's
  behavior changes — are exempt; the PR must say in a sentence why no
  route-level test applies. `npm test` and `npm run lint` must be green
  before merge.

## Change discipline

- Smallest change that fixes the cause. Don't refactor adjacent code,
  reformat untouched lines, or upgrade dependencies in a bug-fix PR.
- Commit messages say what changed and why in the subject; the diff says how.

## Styling

- Tailwind v4 (PostCSS plugin). Utility classes inline in JSX; the only
  stylesheet is `app/globals.css`, which holds the theme tokens and base
  styles.
- The app is dark-theme only (`color-scheme: dark`); the base theme is built
  on the zinc palette. Deliberate accent changes the team asks for are fine —
  keep them scoped to exactly what was asked. Conditional styling is done
  with template-literal class strings, not styled-components or CSS modules.
- Extract a component when markup repeats, not before (`TaskRow`, `DueBadge`
  are the pattern).
