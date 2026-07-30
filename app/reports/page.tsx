import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  STAGES,
  STAGE_LABELS,
  APPROVAL_STEPS,
  APPROVAL_STEP_LABELS,
  type ApprovalStep,
  type Stage,
} from "@/lib/types";
import { evaluateChain, gateInclude } from "@/lib/workflow";
import { fmtMm, daysSince, initials } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireUser();

  const [deals, users] = await Promise.all([
    db.deal.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD", "APPROVED"] } },
      include: {
        assetClass: true,
        lead: true,
        approvals: { include: { decidedBy: true } },
        ...gateInclude,
      },
    }),
    db.user.findMany({
      where: { active: true },
      include: {
        roles: true,
        ledDeals: { where: { status: { in: ["ACTIVE", "ON_HOLD"] } } },
        memberships: {
          where: { deal: { status: { in: ["ACTIVE", "ON_HOLD"] } } },
        },
        followUpsAssigned: { where: { status: "OPEN" } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // ---- pipeline matrix: asset class × stage --------------------------------
  const classNames = [...new Set(deals.map((d) => d.assetClass.name))].sort();
  const cell = new Map<string, { n: number; mm: number }>();
  for (const d of deals) {
    const key = `${d.assetClass.name}|${d.stage}`;
    const c = cell.get(key) ?? { n: 0, mm: 0 };
    c.n += 1;
    c.mm += d.targetSizeMm ?? 0;
    cell.set(key, c);
  }
  const stageTotals = STAGES.map((s) => {
    const inStage = deals.filter((d) => d.stage === s);
    return { n: inStage.length, mm: inStage.reduce((t, d) => t + (d.targetSizeMm ?? 0), 0) };
  });

  // ---- approval queues -----------------------------------------------------
  const inChain = deals.filter((d) => d.stage === "APPROVALS" && d.status === "ACTIVE");
  const queues = APPROVAL_STEPS.map((step) => ({
    step,
    deals: inChain.filter((d) => {
      const c = evaluateChain(d, d.approvals).find((x) => x.step === step)!;
      return c.available;
    }),
  }));
  const myRoles = new Set(user.roles.map((r) => r.role));
  const myQueue = queues
    .filter((q) => myRoles.has(q.step))
    .flatMap((q) => q.deals.map((d) => ({ step: q.step, deal: d })));

  // ---- workload ------------------------------------------------------------
  const workload = users
    .map((u) => ({
      user: u,
      led: u.ledDeals.length,
      ledMm: u.ledDeals.reduce((t, d) => t + (d.targetSizeMm ?? 0), 0),
      member: u.memberships.length,
      openFollowUps: u.followUpsAssigned.length,
    }))
    .filter((w) => w.led + w.member + w.openFollowUps > 0);

  const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-stone-400";
  const td = "px-3 py-2 text-sm text-stone-700";

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-stone-900">Reports</h1>
      <p className="text-[13px] text-stone-500">
        Live views over the in-progress pipeline (passed deals excluded).
      </p>

      {/* Waiting on you */}
      {myQueue.length > 0 && (
        <section className="mt-6 rounded-xl border border-accent-200 bg-accent-50/60 p-5 shadow-sm">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-accent-800">
            Waiting on you
          </h2>
          <ul className="mt-2 space-y-1.5">
            {myQueue.map(({ step, deal }) => (
              <li key={`${step}-${deal.id}`}>
                <Link
                  href={`/deals/${deal.id}`}
                  className="group flex items-center gap-2 text-sm text-stone-800"
                >
                  <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-accent-800 shadow-sm">
                    {APPROVAL_STEP_LABELS[step]}
                  </span>
                  <span className="font-medium group-hover:underline">{deal.managerName}</span>
                  <span className="text-stone-500">
                    {deal.fundName} · {fmtMm(deal.targetSizeMm)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Pipeline matrix */}
      <section className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-900">Pipeline by stage × asset class</h2>
          <p className="text-xs text-stone-500">Deal count and target allocation per cell.</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-stone-50">
              <tr>
                <th className={th}>Asset class</th>
                {STAGES.map((s) => (
                  <th key={s} className={`${th} text-center`}>
                    {STAGE_LABELS[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {classNames.map((ac) => (
                <tr key={ac}>
                  <td className={`${td} font-medium text-stone-900`}>{ac}</td>
                  {STAGES.map((s) => {
                    const c = cell.get(`${ac}|${s}`);
                    return (
                      <td key={s} className="px-3 py-2 text-center">
                        {c ? (
                          <div>
                            <div className="text-sm font-semibold text-stone-800">{c.n}</div>
                            <div className="font-mono text-[11px] text-accent-700">
                              {fmtMm(c.mm)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-stone-200">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-stone-200 bg-stone-50">
              <tr>
                <td className={`${td} font-semibold text-stone-900`}>Total</td>
                {stageTotals.map((t, i) => (
                  <td key={i} className="px-3 py-2 text-center">
                    {t.n > 0 ? (
                      <div>
                        <div className="text-sm font-semibold text-stone-800">{t.n}</div>
                        <div className="font-mono text-[11px] text-accent-700">{fmtMm(t.mm)}</div>
                      </div>
                    ) : (
                      <span className="text-stone-200">·</span>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Approval queue */}
      <section className="mt-6 rounded-xl border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-900">Approval queue</h2>
          <p className="text-xs text-stone-500">
            What each signer can act on right now, in routing order.
          </p>
        </header>
        <div className="grid gap-px bg-stone-100 sm:grid-cols-2 lg:grid-cols-4">
          {queues.map((q) => (
            <div key={q.step} className="bg-white p-4">
              <h3 className="text-[12px] font-semibold text-stone-600">
                {APPROVAL_STEP_LABELS[q.step as ApprovalStep]}
                <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 text-[11px] font-medium text-stone-500">
                  {q.deals.length}
                </span>
              </h3>
              <ul className="mt-2 space-y-1.5">
                {q.deals.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/deals/${d.id}`}
                      className="block rounded-md border border-stone-100 px-2.5 py-1.5 text-[13px] hover:border-accent-300"
                    >
                      <span className="font-medium text-stone-800">{d.managerName}</span>
                      <span className="block text-[11px] text-stone-400">
                        {fmtMm(d.targetSizeMm)} · in stage {daysSince(d.stageEnteredAt)}d
                      </span>
                    </Link>
                  </li>
                ))}
                {q.deals.length === 0 && <li className="text-[12px] text-stone-300">Queue empty</li>}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Workload */}
      <section className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-900">Workload by person</h2>
          <p className="text-xs text-stone-500">Active deals and open follow-ups per person.</p>
        </header>
        <table className="w-full">
          <thead className="bg-stone-50">
            <tr>
              <th className={th}>Person</th>
              <th className={`${th} text-right`}>Leading</th>
              <th className={`${th} text-right`}>Led target $</th>
              <th className={`${th} text-right`}>On team</th>
              <th className={`${th} text-right`}>Open follow-ups</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {workload.map((w) => (
              <tr key={w.user.id}>
                <td className={td}>
                  <span className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-100 text-[10px] font-semibold text-accent-800">
                      {initials(w.user.name)}
                    </span>
                    <span className="font-medium text-stone-900">{w.user.name}</span>
                  </span>
                </td>
                <td className={`${td} text-right font-semibold`}>{w.led || "—"}</td>
                <td className={`${td} text-right font-mono text-[13px] text-accent-700`}>
                  {w.led ? fmtMm(w.ledMm) : "—"}
                </td>
                <td className={`${td} text-right`}>{w.member || "—"}</td>
                <td className={`${td} text-right`}>
                  {w.openFollowUps ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-medium text-amber-700">
                      {w.openFollowUps}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
