import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { STAGES, STAGE_LABELS, canManageDeals, IN_PROGRESS_STATUSES } from "@/lib/types";
import { evaluateGate, gateInclude } from "@/lib/workflow";
import { fmtMm } from "@/lib/format";
import FilterBar from "@/components/FilterBar";
import DealCard from "@/components/DealCard";
import DealMap, { type MapDeal } from "@/components/map/DealMap";

const COLUMN_CAP = 25;

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{
    assetClass?: string;
    lead?: string;
    show?: string;
    view?: string;
    q?: string;
  }>;
}) {
  const user = await requireUser();
  const { assetClass, lead, show, view, q } = await searchParams;
  const isMap = view === "map";
  const query = q?.trim();

  // Default view is the working pipeline; funded and pencils-down deals are
  // hidden until asked for. Search applies over whatever the filters allow.
  const statusFilter =
    show === "all"
      ? {}
      : show === "funded"
        ? { status: "FUNDED" }
        : { status: { in: [...IN_PROGRESS_STATUSES] } };

  const [deals, assetClasses, leads] = await Promise.all([
    db.deal.findMany({
      where: {
        ...(assetClass ? { assetClassId: assetClass } : {}),
        ...(lead ? { leadId: lead } : {}),
        ...statusFilter,
        ...(query
          ? {
              OR: [
                { managerName: { contains: query } },
                { fundName: { contains: query } },
                { strategy: { contains: query } },
              ],
            }
          : {}),
      },
      include: {
        assetClass: true,
        lead: true,
        _count: { select: { followUps: { where: { status: "OPEN" } } } },
        approvals: { select: { status: true } },
        team: { select: { userId: true } },
        ...gateInclude,
      },
      orderBy: { stageEnteredAt: "asc" },
    }),
    db.assetClass.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({
      where: { active: true, ledDeals: { some: {} } },
      orderBy: { name: "asc" },
    }),
  ]);

  const byStage = new Map(STAGES.map((s) => [s as string, [] as typeof deals]));
  for (const d of deals) byStage.get(d.stage)?.push(d);

  const gateReadyOf = (d: (typeof deals)[number]) =>
    d.status === "ACTIVE" && !["APPROVALS", "APPROVED"].includes(d.stage)
      ? evaluateGate(d).ready
      : null;

  const mapDeals: MapDeal[] = isMap
    ? deals.map((d) => ({
        id: d.id,
        managerName: d.managerName,
        fundName: d.fundName,
        targetSizeMm: d.targetSizeMm,
        stage: d.stage,
        status: d.status,
        assetClass: d.assetClass.name,
        leadId: d.leadId,
        leadName: d.lead.name,
        teamIds: d.team.map((t) => t.userId),
        gateReady: gateReadyOf(d),
        openFollowUps: d._count.followUps,
        approvedCount:
          d.stage === "APPROVALS"
            ? d.approvals.filter((a) => a.status === "APPROVED").length
            : null,
      }))
    : [];

  const baseParams = new URLSearchParams();
  if (assetClass) baseParams.set("assetClass", assetClass);
  if (lead) baseParams.set("lead", lead);
  if (show) baseParams.set("show", show);
  if (query) baseParams.set("q", query);
  const viewHref = (v: string) => {
    const p = new URLSearchParams(baseParams);
    if (v === "map") p.set("view", "map");
    const q = p.toString();
    return `/board${q ? `?${q}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-stone-900">Pipeline</h1>
          <p className="text-[13px] text-stone-500">
            {deals.length} deal{deals.length === 1 ? "" : "s"} ·{" "}
            {fmtMm(deals.reduce((s, d) => s + (d.targetSizeMm ?? 0), 0))} target
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-0.5 shadow-sm">
            {[
              ["board", "Board"],
              ["map", "Map"],
            ].map(([v, label]) => (
              <Link
                key={v}
                href={viewHref(v)}
                className={`rounded-md px-2.5 py-1 text-[13px] font-medium ${
                  (v === "map") === isMap
                    ? "bg-accent-700 text-white"
                    : "text-stone-500 hover:bg-stone-100"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
          <FilterBar
            assetClasses={assetClasses.map((a) => ({ value: a.id, label: a.name }))}
            leads={leads.map((u) => ({ value: u.id, label: u.name }))}
          />
          {canManageDeals(user) && (
            <Link
              href="/deals/new"
              className="rounded-md bg-accent-700 px-3 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-accent-800"
            >
              New deal
            </Link>
          )}
        </div>
      </div>

      {isMap ? (
        <DealMap
          deals={mapDeals}
          assetClasses={assetClasses.map((a) => a.name).sort((a, b) => a.localeCompare(b))}
        />
      ) : (
        <div className="mt-5 grid auto-cols-[minmax(205px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-4 [scrollbar-width:thin] [scrollbar-color:theme(colors.stone.300)_transparent]">
          {STAGES.map((stage) => {
            const cards = byStage.get(stage) ?? [];
            const columnMm = cards.reduce((s, d) => s + (d.targetSizeMm ?? 0), 0);
            const toCardProps = (d: (typeof cards)[number]) => ({
              ...d,
              openFollowUps: d._count.followUps,
              approvedCount:
                d.stage === "APPROVALS"
                  ? d.approvals.filter((a) => a.status === "APPROVED").length
                  : null,
              gateReady: gateReadyOf(d),
            });
            return (
              <section
                key={stage}
                className="flex min-h-[60vh] flex-col rounded-xl bg-stone-200/50"
              >
                <header className="flex items-baseline justify-between px-3 pb-1 pt-2.5">
                  <h2 className="text-[12px] font-semibold uppercase tracking-wide text-stone-500">
                    {STAGE_LABELS[stage]}
                  </h2>
                  <span className="flex items-baseline gap-1.5">
                    {columnMm > 0 && (
                      <span className="font-mono text-[10px] text-stone-400">
                        {fmtMm(columnMm)}
                      </span>
                    )}
                    <span className="rounded-full bg-white px-1.5 text-[11px] font-medium text-stone-500">
                      {cards.length}
                    </span>
                  </span>
                </header>
                <div className="flex flex-col gap-2 p-2">
                  {cards.slice(0, COLUMN_CAP).map((d) => (
                    <DealCard key={d.id} deal={toCardProps(d)} />
                  ))}
                  {cards.length > COLUMN_CAP && (
                    <details>
                      <summary className="cursor-pointer rounded-md px-2 py-1.5 text-center text-[12px] font-medium text-stone-500 hover:bg-stone-200">
                        Show {cards.length - COLUMN_CAP} more…
                      </summary>
                      <div className="mt-2 flex flex-col gap-2">
                        {cards.slice(COLUMN_CAP).map((d) => (
                          <DealCard key={d.id} deal={toCardProps(d)} />
                        ))}
                      </div>
                    </details>
                  )}
                  {cards.length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-stone-400">—</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
