# Tasks — dev notes

- Task data lives in a local JSON file (`data/tasks.json` by default, `TASKS_FILE` overrides).
- App logs are NDJSON via pino, written to `logs/app.log` in local dev (`LOG_FILE` overrides).

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
