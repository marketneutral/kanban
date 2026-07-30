import type { GateStatus } from "@/lib/workflow";
import { fmtDate } from "@/lib/format";
import { toggleChecklistItem, markOddComplete } from "@/app/actions/workflow";

type Item = {
  id: string;
  track: string;
  label: string;
  done: boolean;
  doneAt: Date | null;
  doneBy: { name: string } | null;
  sortOrder: number;
};

export default function Tracks({
  dealId,
  items,
  oddCompletedAt,
  oddCompletedBy,
  legal,
  canOps,
  canLegal,
}: {
  dealId: string;
  items: Item[];
  oddCompletedAt: Date | null;
  oddCompletedBy: { name: string } | null;
  legal: GateStatus;
  canOps: boolean;
  canLegal: boolean;
}) {
  const odd = items.filter((i) => i.track === "ODD").sort((a, b) => a.sortOrder - b.sortOrder);
  const legalItems = items
    .filter((i) => i.track === "LEGAL")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const oddDone = odd.length > 0 && odd.every((i) => i.done);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-stone-400">
        ODD &amp; Legal
      </h2>
      <p className="mt-1 text-[12px] text-stone-400">
        Parallel tracks unlocked by the five-pager. ODD gates the Investment Proposal; the legal
        track gates the Legal approval.
      </p>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {/* ODD track */}
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-stone-600">
              Operational DD <span className="font-normal text-stone-400">· Ops</span>
            </h3>
            {oddCompletedAt ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                Complete
              </span>
            ) : (
              <span className="text-[11px] text-stone-400">
                {odd.filter((i) => i.done).length}/{odd.length}
              </span>
            )}
          </div>
          <Checklist items={odd} canToggle={canOps} />
          {oddCompletedAt ? (
            <p className="mt-2 text-[11px] text-stone-400">
              Signed off by {oddCompletedBy?.name ?? "Ops"} on {fmtDate(oddCompletedAt)}
            </p>
          ) : (
            canOps && (
              <form action={markOddComplete} className="mt-2">
                <input type="hidden" name="dealId" value={dealId} />
                <button
                  disabled={!oddDone}
                  title={oddDone ? "Sign off ODD" : "Finish the checklist first"}
                  className={`w-full rounded-md px-3 py-1.5 text-[13px] font-medium shadow-sm ${
                    oddDone
                      ? "bg-accent-700 text-white hover:bg-accent-800"
                      : "cursor-not-allowed bg-stone-100 text-stone-400"
                  }`}
                >
                  Mark ODD complete
                </button>
              </form>
            )
          )}
        </div>

        {/* Legal track */}
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-stone-600">
              Legal docs <span className="font-normal text-stone-400">· Legal</span>
            </h3>
            {legal.ready ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                Ready
              </span>
            ) : (
              <span className="text-[11px] text-stone-400">
                {legalItems.filter((i) => i.done).length}/{legalItems.length}
              </span>
            )}
          </div>
          <Checklist items={legalItems} canToggle={canLegal} />
          <ul className="mt-2 space-y-1">
            {legal.requirements
              .filter((r) => r.key !== "legal-checklist")
              .map((r) => (
                <li key={r.key} className="flex items-center gap-1.5 text-[12px]">
                  <span className={r.met ? "text-emerald-600" : "text-stone-300"}>
                    {r.met ? "✓" : "○"}
                  </span>
                  <span className={r.met ? "text-stone-500" : "text-stone-600"}>{r.label}</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Checklist({ items, canToggle }: { items: Item[]; canToggle: boolean }) {
  if (items.length === 0) {
    return (
      <p className="mt-2 rounded-md bg-stone-50 p-2 text-[12px] text-stone-400">
        Checklist is created when the deal enters ODD &amp; Legal.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-1">
      {items.map((i) => (
        <li key={i.id}>
          <form action={toggleChecklistItem} className="flex items-start gap-2">
            <input type="hidden" name="id" value={i.id} />
            <button
              type="submit"
              disabled={!canToggle}
              title={canToggle ? (i.done ? "Un-check" : "Check off") : "Owned by another team"}
              className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px] font-bold ${
                i.done
                  ? "border-accent-600 bg-accent-600 text-white"
                  : "border-stone-300 bg-white text-transparent"
              } ${canToggle ? "hover:border-accent-500" : "cursor-default opacity-70"}`}
            >
              ✓
            </button>
            <span
              className={`text-[13px] leading-snug ${i.done ? "text-stone-400 line-through decoration-stone-300" : "text-stone-700"}`}
              title={i.doneBy ? `${i.doneBy.name} · ${fmtDate(i.doneAt)}` : undefined}
            >
              {i.label}
            </span>
          </form>
        </li>
      ))}
    </ul>
  );
}
