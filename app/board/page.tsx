import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { STAGES, STAGE_LABELS, canManageDeals } from "@/lib/types";
import { evaluateGate, gateInclude } from "@/lib/workflow";
import { fmtMm } from "@/lib/format";
import FilterBar from "@/components/FilterBar";
import DealCard from "@/components/DealCard";

export const dynamic = "force-dynamic";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ assetClass?: string; lead?: string; show?: string }>;
}) {
  const user = await requireUser();
  const { assetClass, lead, show } = await searchParams;

  const [deals, assetClasses, leads] = await Promise.all([
    db.deal.findMany({
      where: {
        ...(assetClass ? { assetClassId: assetClass } : {}),
        ...(lead ? { leadId: lead } : {}),
        ...(show === "all" ? {} : { status: { in: ["ACTIVE", "ON_HOLD", "APPROVED"] } }),
      },
      include: {
        assetClass: true,
        lead: true,
        _count: { select: { followUps: { where: { status: "OPEN" } } } },
        approvals: { select: { status: true } },
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

      <div className="mt-5 grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const cards = byStage.get(stage) ?? [];
          return (
            <section key={stage} className="flex min-h-[60vh] flex-col rounded-xl bg-stone-200/50">
              <header className="flex items-center justify-between px-3 pb-1 pt-2.5">
                <h2 className="text-[12px] font-semibold uppercase tracking-wide text-stone-500">
                  {STAGE_LABELS[stage]}
                </h2>
                <span className="rounded-full bg-white px-1.5 text-[11px] font-medium text-stone-500">
                  {cards.length}
                </span>
              </header>
              <div className="flex flex-col gap-2 p-2">
                {cards.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={{
                      ...d,
                      openFollowUps: d._count.followUps,
                      approvedCount:
                        d.stage === "APPROVALS"
                          ? d.approvals.filter((a) => a.status === "APPROVED").length
                          : null,
                      gateReady:
                        d.status === "ACTIVE" && !["APPROVALS", "APPROVED"].includes(d.stage)
                          ? evaluateGate(d).ready
                          : null,
                    }}
                  />
                ))}
                {cards.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-stone-400">—</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
