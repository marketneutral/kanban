# Allocator — Investment Process Kanban

An internal app for managing the manager-allocation investment process: each prospective
allocation is a card moving through a gated workflow — One-Pager → Five-Pager → ODD & Legal
→ Investment Proposal → Approvals (MD + Legal → COO → CEO) — with documents, follow-ups,
role-based actions and summary reporting.

See [PLAN.md](./PLAN.md) for the full design: workflow gates, roles matrix, data model
and milestones.

## Stack

Next.js (App Router, TypeScript) · Prisma + SQLite · Tailwind CSS. One process, no
external services; the database lives in `data/app.db`.

## Getting started

```bash
cp .env.example .env      # sets DATABASE_URL (SQLite file)
npm install
npm run db:push           # create the database schema
npm run db:seed           # seed users, asset classes, sample deals
npm run dev               # http://localhost:3000
```

Sign in from the roster (v1 is passwordless, for a trusted network — every action is
attributed to the selected user in the audit trail). The seeded **Avery Stone** holds the
Admin role for managing users, roles and asset classes at `/admin`.

## Running with Docker

The container listens on **port 8642** (deliberately non-standard, to stay clear of other
apps on the host). The SQLite database and uploaded documents live in `/app/data` —
mount a volume there or they vanish with the container.

```bash
docker compose up -d --build          # http://localhost:8642
SEED=1 docker compose up -d --build   # first run: also load demo roster + sample deals
```

Or without compose:

```bash
docker build -t allocator .
docker run -d -p 8642:8642 -v allocator-data:/app/data -e SEED=1 --name allocator allocator
```

To use a different host port, map it in compose (`PORT=9001 docker compose up -d`
publishes `9001 -> 8642`) or change `-p` in `docker run`. The in-container port follows
the `PORT` env var. Seeding is idempotent — `SEED=1` never duplicates data. On startup
the container runs `prisma db push`, which also applies schema updates to an existing
database.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:push` | Sync Prisma schema to SQLite |
| `npm run db:seed` | Seed roster, asset classes, checklist templates, sample deals |

## Status

- **M1 (done)** — scaffold, schema, roster sign-in, kanban board with filters, deal
  CRUD + detail with audit trail, admin (users/roles/asset classes)
- **M2+M3 (done)** — workflow gate engine (`lib/workflow.ts`): hard, server-enforced
  gates on stage advancement; follow-ups with resolve / lead-only waive; presentation
  records; versioned documents (upload + link) with role-scoped kinds; ODD & Legal
  parallel checklist tracks with Ops sign-off; gate readiness dots on the board
- **M4 (done)** — approval chain: MD + Legal in parallel (Legal gated on the legal doc
  track), then COO, then CEO; CEO signature finalizes the deal; rejection returns the
  deal to Investment Proposal, voids all signatures, and files the note as a follow-up
- **M5 (done)** — reports: pipeline matrix (stage × asset class, counts and $mm),
  per-role approval queue with a personal "waiting on you" list, workload by person
