import Link from "next/link";
import type { GateStatus } from "@/lib/workflow";
import { STAGE_LABELS, type Stage } from "@/lib/types";
import { fmtMeeting } from "@/lib/meetings";
import { markFunded, revertFunded, moveStage, setDealStatus } from "@/app/actions/deals";
import { recordPresentation } from "@/app/actions/workflow";
import { fmtDate } from "@/lib/format";

const PRESENTED_STAGES = ["ONE_PAGER", "FIVE_PAGER", "PROPOSAL"];

export default function GatePanel({
  dealId,
  stage,
  status,
  gate,
  manager,
  canFund,
  admin,
  fundedAt,
  prevStage,
  needsPresentation,
  scheduledFor,
}: {
  dealId: string;
  stage: Stage;
  status: string;
  gate: GateStatus;
  manager: boolean;
  /** user may mark the approved deal funded (Ops or admin) */
  canFund: boolean;
  admin: boolean;
  fundedAt: Date | null;
  prevStage: Stage | null;
  needsPresentation: boolean;
  scheduledFor: Date | null;
}) {
  const active = status === "ACTIVE";
  const inChain = stage === "APPROVALS";
  const terminal = stage === "APPROVED";

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-stone-400">
          Stage gate
        </h2>
        {!terminal && gate.nextStage && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              gate.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {gate.ready ? "Ready to advance" : "Items open"}
          </span>
        )}
      </div>

      {terminal ? (
        status === "FUNDED" ? (
          <div className="mt-3">
            <p className="text-sm text-stone-600">
              💰 Closed and funded {fundedAt ? `on ${fmtDate(fundedAt)}` : ""}. This deal is
              complete and hidden from the default board view.
            </p>
            {admin && (
              <form action={revertFunded} className="mt-3">
                <input type="hidden" name="dealId" value={dealId} />
                <button className="w-full rounded-md border border-stone-200 bg-white px-3 py-1.5 text-[12px] text-stone-500 shadow-sm hover:bg-stone-50">
                  Undo funding mark (admin)
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-stone-500">This deal is fully approved. 🎉</p>
            {canFund && status === "APPROVED" && (
              <form
                action={markFunded}
                className="mt-3 flex flex-col gap-2 rounded-lg bg-emerald-50/60 p-3"
              >
                <input type="hidden" name="dealId" value={dealId} />
                <label className="text-[12px] font-medium text-emerald-800">
                  Allocation wired on
                </label>
                <input
                  type="date"
                  name="fundedAt"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-[13px] shadow-sm focus:border-emerald-400 focus:outline-none"
                />
                <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-emerald-700">
                  Mark closed &amp; funded
                </button>
              </form>
            )}
          </div>
        )
      ) : (
        <ul className="mt-3 space-y-2">
          {gate.requirements.map((r) => (
            <li key={r.key} className="flex items-start gap-2.5 text-sm">
              <span
                className={`mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  r.met ? "bg-emerald-100 text-emerald-700" : "border border-stone-300 text-transparent"
                }`}
              >
                ✓
              </span>
              <span className={r.met ? "text-stone-500 line-through decoration-stone-300" : "text-stone-800"}>
                {r.label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {active && needsPresentation && PRESENTED_STAGES.includes(stage) && (
        <p className="mt-3 rounded-md bg-stone-50 px-3 py-2 text-[12px] text-stone-500">
          {scheduledFor ? (
            <>
              📅 On the IC agenda for{" "}
              <span className="font-medium text-stone-700">{fmtMeeting(scheduledFor)}</span>
            </>
          ) : (
            <>
              Not yet on an IC agenda —{" "}
              <Link href="/meetings" className="font-medium text-accent-700 hover:underline">
                schedule it
              </Link>
            </>
          )}
        </p>
      )}

      {manager && active && needsPresentation && PRESENTED_STAGES.includes(stage) && (
        <form
          action={recordPresentation}
          className="mt-3 flex flex-col gap-2 rounded-lg bg-stone-50 p-3"
        >
          <input type="hidden" name="dealId" value={dealId} />
          <label className="text-[12px] font-medium text-stone-600">
            Presented to the team on
          </label>
          <input
            type="date"
            name="presentedAt"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] shadow-sm focus:border-accent-400 focus:outline-none"
          />
          <input
            name="notes"
            placeholder="Notes (optional)"
            className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] shadow-sm placeholder:text-stone-400 focus:border-accent-400 focus:outline-none"
          />
          <button className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-700 shadow-sm hover:bg-stone-100">
            Record presentation
          </button>
        </form>
      )}

      {manager && active && !terminal && (
        <div className="mt-4 flex flex-col gap-2">
          {inChain ? (
            <p className="rounded-md bg-accent-50 p-3 text-[13px] leading-relaxed text-accent-900">
              Signatures are collected in the approval chain panel above — the deal moves to
              Approved on the CEO’s signature.
            </p>
          ) : gate.nextStage ? (
            gate.ready ? (
              <form action={moveStage}>
                <input type="hidden" name="dealId" value={dealId} />
                <input type="hidden" name="direction" value="forward" />
                <button className="w-full rounded-md bg-accent-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-800">
                  Advance to {STAGE_LABELS[gate.nextStage]} →
                </button>
              </form>
            ) : (
              <button
                disabled
                title="Complete the gate requirements above first"
                className="w-full cursor-not-allowed rounded-md bg-stone-200 px-3 py-2 text-sm font-medium text-stone-400"
              >
                Advance to {STAGE_LABELS[gate.nextStage]} →
              </button>
            )
          ) : null}
          {prevStage && (
            <form action={moveStage}>
              <input type="hidden" name="dealId" value={dealId} />
              <input type="hidden" name="direction" value="back" />
              <button className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 shadow-sm hover:bg-stone-50">
                ← Send back to {STAGE_LABELS[prevStage]}
              </button>
            </form>
          )}
        </div>
      )}

      {manager && status !== "FUNDED" && (
        <StatusControls dealId={dealId} status={status} />
      )}
    </section>
  );
}

function StatusControls({ dealId, status }: { dealId: string; status: string }) {
  return (
    <div className="mt-4 border-t border-stone-100 pt-4">
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-stone-400">Status</h3>
      <div className="mt-2 flex flex-col gap-2">
        {status === "ON_HOLD" && (
          <StatusForm dealId={dealId} status="ACTIVE" label="Resume — take off hold" />
        )}
        {status === "ACTIVE" && (
          <StatusForm dealId={dealId} status="ON_HOLD" label="Put on hold" />
        )}
        {status !== "PENCILS_DOWN" && (
          <form action={setDealStatus} className="flex flex-col gap-2">
            <input type="hidden" name="dealId" value={dealId} />
            <input type="hidden" name="status" value="PENCILS_DOWN" />
            <input
              name="reason"
              required
              placeholder="Reason (required) — closes out non-funded"
              className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-[13px] shadow-sm placeholder:text-stone-400 focus:border-accent-400 focus:outline-none"
            />
            <button className="w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-600 shadow-sm hover:bg-red-50">
              ✏️ Pencils down
            </button>
          </form>
        )}
        {status === "PENCILS_DOWN" && (
          <StatusForm dealId={dealId} status="ACTIVE" label="Reopen deal" />
        )}
      </div>
    </div>
  );
}

function StatusForm({ dealId, status, label }: { dealId: string; status: string; label: string }) {
  return (
    <form action={setDealStatus}>
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="status" value={status} />
      <button className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-600 shadow-sm hover:bg-stone-50">
        {label}
      </button>
    </form>
  );
}
