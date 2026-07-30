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
- **M2** — workflow gate engine: hard gates on stage advancement (documents,
  presentation records, follow-up resolution/waiver)
- **M3** — documents (upload + link, versioned), ODD & Legal checklist tracks
- **M4** — approval chain: MD + Legal in parallel, then COO, then CEO; rejection flow
- **M5** — reports (pipeline by stage × asset class, approval queue, workload), polish
