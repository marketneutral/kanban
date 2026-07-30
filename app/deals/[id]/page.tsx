import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  STAGES,
  STAGE_LABELS,
  DEAL_STATUS_LABELS,
  canManageDeals,
  hasRole,
  isAdmin,
  stageIndex,
  type Stage,
  type DealStatus,
} from "@/lib/types";
import { evaluateGate, evaluateLegal, evaluateChain } from "@/lib/workflow";
import ApprovalChain from "@/components/deal/ApprovalChain";
import { fmtMm, fmtDate, daysSince, initials } from "@/lib/format";
import GatePanel from "@/components/deal/GatePanel";
import Documents from "@/components/deal/Documents";
import FollowUps from "@/components/deal/FollowUps";
import Tracks from "@/components/deal/Tracks";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  DEAL_CREATED: "created the deal",
  DEAL_UPDATED: "edited deal details",
  STAGE_ADVANCED: "advanced the deal",
  STAGE_SENT_BACK: "sent the deal back",
  STATUS_ON_HOLD: "put the deal on hold",
  STATUS_ACTIVE: "reactivated the deal",
  STATUS_PASSED: "passed on the deal",
  FOLLOWUP_ADDED: "added a follow-up",
  FOLLOWUP_RESOLVED: "resolved a follow-up",
  FOLLOWUP_WAIVED: "waived a follow-up",
  FOLLOWUP_REOPENED: "reopened a follow-up",
  PRESENTED: "recorded a team presentation",
  DOCUMENT_ADDED: "attached a document",
  ODD_COMPLETED: "signed off operational due diligence",
  IC_SCHEDULED: "put the deal on an IC agenda",
  IC_UNSCHEDULED: "removed the deal from the IC agenda",
  APPROVAL_GRANTED: "signed an approval",
  APPROVAL_REJECTED: "rejected the deal at approval",
  DEAL_APPROVED: "gave final approval — deal approved",
};

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const deal = await db.deal.findUnique({
    where: { id },
    include: {
      assetClass: true,
      lead: true,
      oddCompletedBy: true,
      team: { include: { user: true } },
      documents: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
      followUps: {
        include: { assignee: true, createdBy: true },
        orderBy: { createdAt: "desc" },
      },
      checklistItems: { include: { doneBy: true } },
      presentations: true,
      approvals: { include: { decidedBy: true } },
      events: { include: { actor: true }, orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!deal) notFound();

  const users = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  const manager = canManageDeals(user);
  const admin = isAdmin(user);
  const isLead = deal.leadId === user.id || admin;
  const canOps = hasRole(user, "OPS") || admin;
  const canLegal = hasRole(user, "LEGAL") || admin;
  const canAttach = manager || canOps || canLegal;

  const idx = stageIndex(deal.stage);
  const status = deal.status as DealStatus;
  const gate = evaluateGate(deal);
  const legal = evaluateLegal(deal);
  const needsPresentation = !deal.presentations.some((p) => p.stage === deal.stage);
  const showTracks = idx >= stageIndex("ODD_LEGAL") || deal.checklistItems.length > 0;
  const showChain = deal.stage === "APPROVALS" || deal.stage === "APPROVED";
  const chain = showChain ? evaluateChain(deal, deal.approvals) : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-6">
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
                  current ? "bg-accent-700 text-white" : done ? "text-accent-700" : "text-stone-400"
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

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* Left column */}
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

            {deal.presentations.length > 0 && (
              <>
                <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-stone-400">
                  Presentations
                </h3>
                <ul className="mt-2 space-y-1 text-[13px] text-stone-600">
                  {deal.presentations
                    .slice()
                    .sort((a, b) => +new Date(b.presentedAt) - +new Date(a.presentedAt))
                    .map((p) => (
                      <li key={p.id}>
                        <span className="font-medium">
                          {STAGE_LABELS[p.stage as Stage] ?? p.stage}
                        </span>{" "}
                        — presented {fmtDate(p.presentedAt)}
                        {p.notes && <span className="text-stone-400"> · {p.notes}</span>}
                      </li>
                    ))}
                </ul>
              </>
            )}

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

          <Documents dealId={deal.id} documents={deal.documents} canAttach={canAttach} />

          <FollowUps
            dealId={deal.id}
            currentStage={deal.stage}
            followUps={deal.followUps}
            users={users}
            isLead={isLead}
          />

          {showTracks && (
            <Tracks
              dealId={deal.id}
              items={deal.checklistItems}
              oddCompletedAt={deal.oddCompletedAt}
              oddCompletedBy={deal.oddCompletedBy}
              legal={legal}
              canOps={canOps}
              canLegal={canLegal}
            />
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {chain && (
            <ApprovalChain
              dealId={deal.id}
              chain={chain}
              userRoles={user.roles.map((r) => r.role)}
              finalized={deal.stage === "APPROVED"}
            />
          )}
          <GatePanel
            dealId={deal.id}
            stage={deal.stage as Stage}
            status={status}
            gate={gate}
            manager={manager}
            prevStage={idx > 0 ? (STAGES[idx - 1] as Stage) : null}
            needsPresentation={needsPresentation}
            scheduledFor={deal.scheduledFor}
          />

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
                        {detail?.title && <span className="text-stone-500"> — “{detail.title}”</span>}
                        {detail?.name && <span className="text-stone-500"> — {detail.name}</span>}
                        {detail?.reason && (
                          <span className="text-stone-500"> — “{detail.reason}”</span>
                        )}
                        {detail?.note && <span className="text-stone-500"> — “{detail.note}”</span>}
                      </p>
                      <p className="text-[11px] text-stone-400">{fmtDate(e.createdAt)}</p>
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
