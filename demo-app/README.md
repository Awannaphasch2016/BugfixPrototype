# Tasks

Small internal task tracker. Next.js (App Router) + TypeScript, tasks persisted
to a local JSON file under `data/`.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API

- `GET /api/tasks` — list tasks
- `POST /api/tasks` — create a task (`{ title, dueDate? }`)
- `PATCH /api/tasks/:id` — update a task (`{ title?, completed?, dueDate? }`)
