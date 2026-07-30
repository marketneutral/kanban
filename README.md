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
npm run dev -- -p 8642    # …or any other port, if 3000 is taken
```

Sign in from the roster (v1 is passwordless, for a trusted network — every action is
attributed to the selected user in the audit trail). The seeded **Avery Stone** holds the
Admin role for managing users, roles and asset classes at `/admin`.

## Running with Docker

The container listens on **port 8642** (deliberately non-standard, to stay clear of other
apps on the host). The SQLite database and uploaded documents live in `/app/data` —
mount a volume there or they vanish with the container.

```bash
# first run — builds, starts, and loads the demo roster + sample deals
SEED=1 docker compose up -d --build
# → http://localhost:8642  (sign in as Avery Stone for admin)

# subsequent starts
docker compose up -d
```

Everyday operations:

```bash
docker compose logs -f      # watch the app
docker compose down         # stop — the data volume survives
git pull && docker compose up -d --build   # upgrade — schema migrates on boot, data kept
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

## ✨ AI document reviews (optional, via Azure OpenAI)

Legal/Ops/deal team can run a one-click AI review of an uploaded LPA, sub docs, or DDQ.
The document text is extracted server-side (native `.docx` via mammoth, `.pdf` via
pdf-parse, other Office formats via their LibreOffice preview) and reviewed against the
firm's **review standards** — admin-editable prompts at `/admin` covering fees,
liquidity, key-man, GP removal, indemnification, MFN, and more. Results appear on the
deal as an assessment plus severity-ranked findings with clause references, verbatim
excerpts, and suggested negotiation asks — a first-pass lens for the professionals, not
a substitute.

```bash
export AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_DEPLOYMENT=your-gpt-deployment    # must support structured outputs (json_schema)
# optional: AZURE_OPENAI_API_VERSION (default 2024-10-21)
```

Without these the feature simply stays hidden. Reviews are audited like every other
action. Scanned (image-only) documents aren't supported yet — extraction requires a
text layer.

## 🗺 Pipeline Map

The board has a **Board | Map** toggle. The map renders every deal as a bubble —
area = target $, color = asset class (CVD-validated palette), ring = gate status — packed
by a force simulation into clusters you can switch live: **asset class** (default),
**stage lanes**, or **deal lead**; each cluster is captioned with its count and total $.
Pan and zoom freely (semantic zoom reveals names, then sizes and stages); hovering a
deal shows a tooltip and illuminates links to every deal sharing its lead or team
members; clicking opens the deal. Built for hundreds of deals — bubble sizes auto-scale
to keep clusters legible, and the kanban itself caps columns at 25 cards with a
"Show more" expander. Same filters drive both views.

## 😈 Devil's Advocate

On any uploaded one-pager, five-pager, or investment proposal, run a **Devil's Advocate**
analysis: an adversarial rebuttal against the committee's own rubrics (admin-editable at
`/admin`, seeded with rubrics per document kind). The result is a verdict (*well
supported / needs stronger evidence / thesis at risk*), the strongest honest bear case,
claim-by-claim rebuttals with severity and the evidence that would settle each, and the
hardest questions to ask the presenting team. Designed to pressure-test ideas before
they reach the IC — the deal team sees the attack before the committee does.

## ✨ Deal-card autofill from a pitch deck

On **New deal**, upload the manager's deck (PDF, docx, pptx…) and the app creates the
card for you — manager, fund, asset class, strategy, size — plus a full **manager
profile** on the deal: key people, commercial terms, known deadlines, and the track
record charted:

- **Hedge funds** — cumulative net return vs. the benchmark named in the deck, with
  CAGR / vol / Sharpe / max-drawdown chips (figures transcribed from the deck, never
  invented).
- **Private markets** — prior-fund DPI and TVPI by vintage year, plotted against
  benchmark TVPI quintile bands (seeded with an illustrative dataset — replace the
  `Benchmark` row with your provider's quintiles), plus a fund-history table.

The deck is attached to the deal as a Pitch Deck document; "✨ Extract profile" on any
attached deck (re)builds the profile. Everything stays editable, and every extraction is
audited. Uses the same Azure OpenAI configuration as document reviews. The seed ships
sample assets — two decks, an LPA with deliberately off-market terms, sub docs, a DDQ,
and a one-pager — so every AI feature is demoable immediately.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:push` | Sync Prisma schema to SQLite |
| `npm run db:seed` | Seed roster, asset classes, checklist templates, sample deals |
| `npx tsx prisma/stress.ts 200` | Insert 200 synthetic deals to scale-test the board/map (`--clean` removes them) |

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
- **Post-v1 (done)** — in-app document viewer (native PDF + image rendering, versioned,
  with Office docs auto-converted to PDF previews via LibreOffice at upload); IC
  meetings page: Monday agendas, deal scheduling, materials-readiness badges

> Office-doc previews need LibreOffice on the host (`soffice` on PATH). The Docker image
> includes it; without it, uploads still work and the viewer offers downloads instead.
