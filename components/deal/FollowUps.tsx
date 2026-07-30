import { STAGE_LABELS, type Stage } from "@/lib/types";
import { fmtDate, initials } from "@/lib/format";
import {
  addFollowUp,
  resolveFollowUp,
  waiveFollowUp,
  reopenFollowUp,
} from "@/app/actions/workflow";

type FollowUp = {
  id: string;
  stage: string;
  title: string;
  status: string;
  waiveNote: string | null;
  createdAt: Date;
  createdBy: { name: string };
  assignee: { name: string } | null;
};

export default function FollowUps({
  dealId,
  currentStage,
  followUps,
  users,
  isLead,
}: {
  dealId: string;
  currentStage: string;
  followUps: FollowUp[];
  users: { id: string; name: string }[];
  isLead: boolean;
}) {
  const current = followUps.filter((f) => f.stage === currentStage);
  const earlier = followUps.filter((f) => f.stage !== currentStage);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-stone-400">
          Follow-ups
        </h2>
        <span className="text-[11px] text-stone-400">
          {current.filter((f) => f.status === "OPEN").length} open in this stage
        </span>
      </div>

      <form action={addFollowUp} className="mt-3 flex gap-2">
        <input type="hidden" name="dealId" value={dealId} />
        <input
          name="title"
          required
          placeholder="Add a follow-up for this stage…"
          className="min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-[13px] shadow-sm placeholder:text-stone-400 focus:border-accent-400 focus:outline-none"
        />
        <select
          name="assigneeId"
          defaultValue=""
          className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-[13px] text-stone-600 shadow-sm focus:border-accent-400 focus:outline-none"
        >
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button className="rounded-md bg-accent-700 px-3 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-accent-800">
          Add
        </button>
      </form>

      <ul className="mt-3 space-y-2">
        {current.map((f) => (
          <Item key={f.id} f={f} isLead={isLead} />
        ))}
        {current.length === 0 && (
          <p className="py-2 text-center text-sm text-stone-400">
            No follow-ups in this stage.
          </p>
        )}
      </ul>

      {earlier.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[12px] font-medium text-stone-400 hover:text-stone-600">
            Earlier stages ({earlier.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {earlier.map((f) => (
              <Item key={f.id} f={f} isLead={isLead} showStage />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Item({ f, isLead, showStage }: { f: FollowUp; isLead: boolean; showStage?: boolean }) {
  const open = f.status === "OPEN";
  return (
    <li className={`rounded-lg border px-3 py-2 ${open ? "border-amber-200 bg-amber-50/50" : "border-stone-100 bg-stone-50"}`}>
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
            open ? "bg-amber-400" : f.status === "WAIVED" ? "bg-stone-300" : "bg-emerald-400"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${open ? "text-stone-800" : "text-stone-500"}`}>
            {f.title}
            {f.status === "WAIVED" && (
              <span className="ml-1.5 rounded bg-stone-200 px-1 py-0.5 text-[10px] font-semibold uppercase text-stone-500">
                waived
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-400">
            {showStage && `${STAGE_LABELS[f.stage as Stage] ?? f.stage} · `}
            {f.createdBy.name} · {fmtDate(f.createdAt)}
            {f.assignee && (
              <span className="ml-1.5 inline-flex items-center gap-1">
                → <span className="font-medium text-stone-500">{f.assignee.name}</span>
              </span>
            )}
            {f.waiveNote && <span className="italic"> — “{f.waiveNote}”</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {open ? (
            <>
              <form action={resolveFollowUp}>
                <input type="hidden" name="id" value={f.id} />
                <button
                  className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[12px] font-medium text-emerald-700 shadow-sm hover:bg-emerald-50"
                  title="Mark resolved"
                >
                  Resolve
                </button>
              </form>
              {isLead && (
                <details className="relative">
                  <summary className="cursor-pointer list-none rounded-md border border-stone-200 bg-white px-2 py-1 text-[12px] text-stone-500 shadow-sm hover:bg-stone-50">
                    Waive
                  </summary>
                  <form
                    action={waiveFollowUp}
                    className="absolute right-0 z-10 mt-1 flex w-64 flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-lg"
                  >
                    <input type="hidden" name="id" value={f.id} />
                    <input
                      name="note"
                      required
                      autoFocus
                      placeholder="Why is this waived? (required)"
                      className="rounded-md border border-stone-200 px-2.5 py-1.5 text-[13px] shadow-sm placeholder:text-stone-400 focus:border-accent-400 focus:outline-none"
                    />
                    <button className="rounded-md bg-stone-700 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-stone-800">
                      Waive with note
                    </button>
                  </form>
                </details>
              )}
            </>
          ) : (
            <form action={reopenFollowUp}>
              <input type="hidden" name="id" value={f.id} />
              <button
                className="rounded-md px-2 py-1 text-[12px] text-stone-400 hover:text-stone-600"
                title="Reopen"
              >
                Reopen
              </button>
            </form>
          )}
        </div>
      </div>
    </li>
  );
}
