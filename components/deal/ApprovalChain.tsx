import type { ChainStep } from "@/lib/workflow";
import { APPROVAL_STEP_LABELS, ROLE_LABELS } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { decideApproval } from "@/app/actions/approvals";

export default function ApprovalChain({
  dealId,
  chain,
  userRoles,
  finalized,
}: {
  dealId: string;
  chain: ChainStep[];
  userRoles: string[];
  finalized: boolean;
}) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-stone-400">
          Approval chain
        </h2>
        <span className="text-[11px] text-stone-400">
          {chain.filter((c) => c.row?.status === "APPROVED").length}/4 signed
        </span>
      </div>
      <p className="mt-1 text-[12px] text-stone-400">
        MD and Legal sign in parallel, then COO, then CEO.
      </p>

      <ol className="mt-3 space-y-2.5">
        {chain.map((c) => {
          const approved = c.row?.status === "APPROVED";
          const mine = userRoles.includes(c.requiredRole);
          return (
            <li
              key={c.step}
              className={`rounded-lg border p-3 ${
                approved
                  ? "border-emerald-100 bg-emerald-50/50"
                  : c.available
                    ? "border-accent-200 bg-accent-50/50"
                    : "border-stone-100 bg-stone-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                    approved
                      ? "bg-emerald-500 text-white"
                      : c.available
                        ? "bg-accent-600 text-white"
                        : "border border-stone-300 text-stone-300"
                  }`}
                >
                  {approved ? "✓" : c.available ? "!" : "·"}
                </span>
                <span className="flex-1 text-sm font-medium text-stone-800">
                  {c.step === "MD"
                    ? `${ROLE_LABELS[c.requiredRole]} — Investment`
                    : APPROVAL_STEP_LABELS[c.step]}
                </span>
                {approved ? (
                  <span className="text-[11px] text-stone-400">
                    {c.row?.decidedBy?.name} · {fmtDate(c.row?.decidedAt)}
                  </span>
                ) : finalized ? null : c.available ? (
                  <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-accent-800">
                    Awaiting signature
                  </span>
                ) : (
                  <span className="text-[11px] text-stone-400">Queued</span>
                )}
              </div>

              {c.row?.note && approved && (
                <p className="mt-1.5 pl-7.5 text-[12px] italic text-stone-500">“{c.row.note}”</p>
              )}
              {!approved && c.blockedReason && (
                <p className="mt-1.5 pl-7.5 text-[12px] text-stone-400">{c.blockedReason}</p>
              )}

              {c.available && mine && (
                <form action={decideApproval} className="mt-2.5 flex flex-col gap-2 pl-7.5">
                  <input type="hidden" name="dealId" value={dealId} />
                  <input type="hidden" name="step" value={c.step} />
                  <input
                    name="note"
                    placeholder="Note — optional to approve, required to reject"
                    className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] shadow-sm placeholder:text-stone-400 focus:border-accent-400 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      name="decision"
                      value="approve"
                      className="flex-1 rounded-md bg-accent-700 px-3 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-accent-800"
                    >
                      Approve
                    </button>
                    <button
                      name="decision"
                      value="reject"
                      className="flex-1 rounded-md border border-red-200 bg-white px-3 py-1.5 text-[13px] font-medium text-red-600 shadow-sm hover:bg-red-50"
                    >
                      Reject
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ol>

      {!finalized && (
        <p className="mt-3 text-[11px] leading-relaxed text-stone-400">
          A rejection returns the deal to Investment Proposal, voids all signatures, and files
          the rejection note as a follow-up for the deal team.
        </p>
      )}
    </section>
  );
}
