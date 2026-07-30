import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  STAGES,
  STAGE_LABELS,
  DEAL_STATUS_LABELS,
  canManageDeals,
  stageIndex,
  type Stage,
  type DealStatus,
} from "@/lib/types";
import { fmtMm, fmtDate, daysSince, initials } from "@/lib/format";
import { moveStage, setDealStatus } from "@/app/actions/deals";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  DEAL_CREATED: "created the deal",
  DEAL_UPDATED: "edited deal details",
  STAGE_ADVANCED: "advanced the deal",
  STAGE_SENT_BACK: "sent the deal back",
  STATUS_ON_HOLD: "put the deal on hold",
  STATUS_ACTIVE: "reactivated the deal",
  STATUS_PASSED: "passed on the deal",
};

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const deal = await db.deal.findUnique({
    where: { id },
    include: {
      assetClass: true,
      lead: true,
      team: { include: { user: true } },
      events: { include: { actor: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!deal) notFound();

  const manager = canManageDeals(user);
  const idx = stageIndex(deal.stage);
  const status = deal.status as DealStatus;
  const active = status === "ACTIVE";
  const canAdvance = manager && active && idx < STAGES.length - 2; // APPROVED only via approval chain
  const canSendBack = manager && active && idx > 0;

  return (
    <div className="mx-auto max-w-5xl px-5 py-6">
      <Link href="/board" className="text-[13px] text-stone-500 hover:text-stone-800">
        ← Board
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-stone-900">
              {deal.managerName}
            </h1>
            <StatusBadge status={status} />
          </div>
          <p className="text-sm text-stone-500">{deal.fundName}</p>
        </div>
        {manager && (
          <Link
            href={`/deals/${deal.id}/edit`}
            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-700 shadow-sm hover:bg-stone-50"
          >
            Edit
          </Link>
        )}
      </div>

      {/* Stage stepper */}
      <ol className="mt-5 flex overflow-x-auto rounded-xl border border-stone-200 bg-white p-1.5 shadow-sm">
        {STAGES.map((s, i) => {
          const current = i === idx;
          const done = i < idx || status === "APPROVED";
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center">
              <div
                className={`w-full truncate rounded-lg px-2.5 py-2 text-center text-[12px] font-medium ${
                  current
                    ? "bg-accent-700 text-white"
                    : done
                      ? "text-accent-700"
                      : "text-stone-400"
                }`}
              >
                {done && !current ? "✓ " : ""}
                {STAGE_LABELS[s]}
              </div>
              {i < STAGES.length - 1 && <span className="px-0.5 text-stone-200">›</span>}
            </li>
          );
        })}
      </ol>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Left: facts + notes */}
        <div className="space-y-5">
          <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-stone-400">
              Overview
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Fact label="Asset class" value={deal.assetClass.name} />
              <Fact label="Target size" value={fmtMm(deal.targetSizeMm)} />
              <Fact label="Strategy" value={deal.strategy ?? "—"} />
              <Fact label="Source" value={deal.source ?? "—"} />
              <Fact label="Created" value={fmtDate(deal.createdAt)} />
              <Fact
                label="In stage"
                value={`${daysSince(deal.stageEnteredAt)}d (since ${fmtDate(deal.stageEnteredAt)})`}
              />
            </dl>

            <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-stone-400">
              Team
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <PersonChip name={deal.lead.name} tag="Lead" />
              {deal.team
                .filter((t) => t.userId !== deal.leadId)
                .map((t) => (
                  <PersonChip key={t.id} name={t.user.name} />
                ))}
            </div>

            {deal.notes && (
              <>
                <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-stone-400">
                  Notes
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
                  {deal.notes}
                </p>
              </>
            )}

            {deal.passedReason && (
              <div className="mt-5 rounded-lg bg-stone-100 p-3 text-sm text-stone-600">
                <span className="font-medium text-stone-800">Passed:</span> {deal.passedReason}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-400">
            Documents, follow-ups, ODD &amp; Legal checklists, and the approval chain land in the
            next milestones (M2–M4) — the schema behind them is already in place.
          </section>
        </div>

        {/* Right: workflow controls + activity */}
        <div className="space-y-5">
          {manager && (
            <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-stone-400">
                Workflow
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                {canAdvance && (
                  <form action={moveStage}>
                    <input type="hidden" name="dealId" value={deal.id} />
                    <input type="hidden" name="direction" value="forward" />
                    <button className="w-full rounded-md bg-accent-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-800">
                      Advance to {STAGE_LABELS[STAGES[idx + 1] as Stage]} →
                    </button>
                  </form>
                )}
                {deal.stage === "APPROVALS" && active && (
                  <p className="rounded-md bg-accent-50 p-3 text-[13px] leading-relaxed text-accent-900">
                    This deal is in the approval chain: MD and Legal sign in parallel, then COO,
                    then CEO. Approval actions arrive in M4.
                  </p>
                )}
                {canSendBack && (
                  <form action={moveStage}>
                    <input type="hidden" name="dealId" value={deal.id} />
                    <input type="hidden" name="direction" value="back" />
                    <button className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 shadow-sm hover:bg-stone-50">
                      ← Send back to {STAGE_LABELS[STAGES[idx - 1] as Stage]}
                    </button>
                  </form>
                )}
                <p className="text-xs leading-relaxed text-stone-400">
                  Hard gates (documents, presentations, open follow-ups) will enforce these moves
                  from M2.
                </p>
              </div>

              <h3 className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-stone-400">
                Status
              </h3>
              <div className="mt-2 flex flex-col gap-2">
                {status === "ON_HOLD" ? (
                  <form action={setDealStatus}>
                    <input type="hidden" name="dealId" value={deal.id} />
                    <input type="hidden" name="status" value="ACTIVE" />
                    <button className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 shadow-sm hover:bg-stone-50">
                      Resume — take off hold
                    </button>
                  </form>
                ) : active ? (
                  <form action={setDealStatus}>
                    <input type="hidden" name="dealId" value={deal.id} />
                    <input type="hidden" name="status" value="ON_HOLD" />
                    <button className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 shadow-sm hover:bg-stone-50">
                      Put on hold
                    </button>
                  </form>
                ) : null}
                {status !== "PASSED" && status !== "APPROVED" && (
                  <form action={setDealStatus} className="flex flex-col gap-2">
                    <input type="hidden" name="dealId" value={deal.id} />
                    <input type="hidden" name="status" value="PASSED" />
                    <input
                      name="reason"
                      required
                      placeholder="Reason for passing (required)"
                      className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-[13px] shadow-sm placeholder:text-stone-400 focus:border-accent-400 focus:outline-none"
                    />
                    <button className="w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-600 shadow-sm hover:bg-red-50">
                      Pass on this deal
                    </button>
                  </form>
                )}
                {status === "PASSED" && (
                  <form action={setDealStatus}>
                    <input type="hidden" name="dealId" value={deal.id} />
                    <input type="hidden" name="status" value="ACTIVE" />
                    <button className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 shadow-sm hover:bg-stone-50">
                      Reopen deal
                    </button>
                  </form>
                )}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-stone-400">
              Activity
            </h2>
            <ol className="mt-3 space-y-3">
              {deal.events.map((e) => {
                const detail = e.detail ? (JSON.parse(e.detail) as Record<string, string>) : null;
                return (
                  <li key={e.id} className="flex gap-2.5 text-[13px]">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-stone-100 text-[9px] font-semibold text-stone-500">
                      {e.actor ? initials(e.actor.name) : "•"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-stone-700">
                        <span className="font-medium text-stone-900">
                          {e.actor?.name ?? "System"}
                        </span>{" "}
                        {EVENT_LABELS[e.action] ?? e.action.toLowerCase().replaceAll("_", " ")}
                        {detail?.from && detail?.to && (
                          <span className="text-stone-500">
                            {" "}
                            — {detail.from} → {detail.to}
                          </span>
                        )}
                        {detail?.reason && (
                          <span className="text-stone-500"> — “{detail.reason}”</span>
                        )}
                      </p>
                      <p className="text-[11px] text-stone-400">
                        {fmtDate(e.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="mt-0.5 text-stone-800">{value}</dd>
    </div>
  );
}

function PersonChip({ name, tag }: { name: string; tag?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white py-1 pl-1 pr-2.5 text-[13px] text-stone-700 shadow-sm">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-100 text-[9px] font-semibold text-accent-800">
        {initials(name)}
      </span>
      {name}
      {tag && <span className="text-[10px] font-semibold uppercase text-accent-600">{tag}</span>}
    </span>
  );
}

function StatusBadge({ status }: { status: DealStatus }) {
  const styles: Record<DealStatus, string> = {
    ACTIVE: "bg-accent-50 text-accent-800",
    ON_HOLD: "bg-amber-50 text-amber-700",
    PASSED: "bg-stone-100 text-stone-500",
    APPROVED: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status]}`}>
      {DEAL_STATUS_LABELS[status]}
    </span>
  );
}
