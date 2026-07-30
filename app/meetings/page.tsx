import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { STAGE_LABELS, canManageDeals, type Stage } from "@/lib/types";
import {
  PRESENTATION_STAGES,
  fmtMeeting,
  meetingKey,
  nextMondays,
  todayUtc,
} from "@/lib/meetings";
import { fmtMm, initials } from "@/lib/format";
import { scheduleForIC, unscheduleFromIC } from "@/app/actions/workflow";

export const dynamic = "force-dynamic";

const PRESENTS: Record<string, string> = {
  ONE_PAGER: "One-pager",
  FIVE_PAGER: "Five-pager",
  PROPOSAL: "Investment proposal",
};

export default async function MeetingsPage() {
  const user = await requireUser();
  const manager = canManageDeals(user);
  const mondays = nextMondays(4);

  const deals = await db.deal.findMany({
    where: {
      status: "ACTIVE",
      stage: { in: [...PRESENTATION_STAGES] },
    },
    include: {
      assetClass: true,
      lead: true,
      presentations: true,
      documents: { select: { kind: true } },
    },
    orderBy: { stageEnteredAt: "asc" },
  });

  // A deal needs the IC when its current stage hasn't been presented yet.
  const needsIc = deals.filter(
    (d) => !d.presentations.some((p) => p.stage === d.stage)
  );
  const today = todayUtc();
  const byMeeting = new Map<string, typeof deals>(mondays.map((m) => [meetingKey(m), []]));
  const unscheduled: typeof deals = [];
  for (const d of needsIc) {
    const key =
      d.scheduledFor && d.scheduledFor >= today ? meetingKey(d.scheduledFor) : null;
    if (key && byMeeting.has(key)) byMeeting.get(key)!.push(d);
    else unscheduled.push(d);
  }

  const docKindForStage: Record<string, string> = {
    ONE_PAGER: "ONE_PAGER",
    FIVE_PAGER: "FIVE_PAGER",
    PROPOSAL: "PROPOSAL",
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-stone-900">IC meetings</h1>
      <p className="text-[13px] text-stone-500">
        The investment committee meets every Monday. Deals present their one-pager,
        five-pager, or investment proposal; recording the presentation on the deal clears it
        from the agenda.
      </p>

      {/* Upcoming Mondays */}
      <div className="mt-6 space-y-5">
        {mondays.map((m, i) => {
          const agenda = byMeeting.get(meetingKey(m))!;
          return (
            <section
              key={meetingKey(m)}
              className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
            >
              <header className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-stone-900">
                  {fmtMeeting(m)}
                  {i === 0 && (
                    <span className="ml-2 rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-accent-800">
                      Next IC
                    </span>
                  )}
                </h2>
                <span className="text-[11px] text-stone-400">
                  {agenda.length} item{agenda.length === 1 ? "" : "s"}
                </span>
              </header>
              {agenda.length === 0 ? (
                <p className="px-5 py-4 text-sm text-stone-400">No agenda items yet.</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {agenda.map((d) => {
                    const hasDoc = d.documents.some(
                      (doc) => doc.kind === docKindForStage[d.stage]
                    );
                    return (
                      <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-100 text-[10px] font-semibold text-accent-800">
                          {initials(d.lead.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/deals/${d.id}`}
                            className="text-sm font-medium text-stone-900 hover:underline"
                          >
                            {d.managerName}
                          </Link>
                          <p className="text-[12px] text-stone-500">
                            {PRESENTS[d.stage]} · {d.assetClass.name} ·{" "}
                            {fmtMm(d.targetSizeMm)} · led by {d.lead.name}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            hasDoc
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {hasDoc ? "Materials attached" : "Materials missing"}
                        </span>
                        {manager && (
                          <form action={unscheduleFromIC}>
                            <input type="hidden" name="dealId" value={d.id} />
                            <button
                              className="shrink-0 rounded-md px-2 py-1 text-[12px] text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                              title="Remove from this agenda"
                            >
                              Remove
                            </button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {/* Backlog */}
      <section className="mt-6 overflow-hidden rounded-xl border border-dashed border-stone-300 bg-stone-50">
        <header className="px-5 pb-1 pt-4">
          <h2 className="text-sm font-semibold text-stone-700">Awaiting scheduling</h2>
          <p className="text-[12px] text-stone-500">
            Deals whose current stage still needs a team presentation.
          </p>
        </header>
        {unscheduled.length === 0 ? (
          <p className="px-5 pb-4 pt-2 text-sm text-stone-400">
            Everything that needs the IC is on an agenda. 🎉
          </p>
        ) : (
          <ul className="divide-y divide-stone-200/70 pb-2">
            {unscheduled.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/deals/${d.id}`}
                    className="text-sm font-medium text-stone-900 hover:underline"
                  >
                    {d.managerName}
                  </Link>
                  <p className="text-[12px] text-stone-500">
                    {PRESENTS[d.stage]} · {STAGE_LABELS[d.stage as Stage]} stage ·{" "}
                    {d.assetClass.name}
                    {d.scheduledFor && d.scheduledFor < today && (
                      <span className="ml-1.5 font-medium text-amber-600">
                        missed {fmtMeeting(d.scheduledFor)} — reschedule
                      </span>
                    )}
                  </p>
                </div>
                {manager && (
                  <form action={scheduleForIC} className="flex items-center gap-2">
                    <input type="hidden" name="dealId" value={d.id} />
                    <select
                      name="meetingDate"
                      defaultValue={meetingKey(mondays[0])}
                      className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-[13px] shadow-sm focus:border-accent-400 focus:outline-none"
                    >
                      {mondays.map((m) => (
                        <option key={meetingKey(m)} value={meetingKey(m)}>
                          {fmtMeeting(m)}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-md bg-accent-700 px-3 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-accent-800">
                      Schedule
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
