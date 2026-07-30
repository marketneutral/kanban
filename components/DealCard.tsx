import Link from "next/link";
import { fmtMm, daysSince, initials } from "@/lib/format";

export type DealCardData = {
  id: string;
  managerName: string;
  fundName: string;
  targetSizeMm: number | null;
  status: string;
  stageEnteredAt: Date;
  assetClass: { name: string };
  lead: { name: string };
  openFollowUps: number;
};

export default function DealCard({ deal }: { deal: DealCardData }) {
  const days = daysSince(deal.stageEnteredAt);
  const onHold = deal.status === "ON_HOLD";
  const passed = deal.status === "PASSED";

  return (
    <Link
      href={`/deals/${deal.id}`}
      className={`block rounded-lg border bg-white p-3 shadow-sm transition hover:-translate-y-px hover:shadow ${
        passed
          ? "border-stone-200 opacity-50"
          : onHold
            ? "border-dashed border-stone-300 opacity-75"
            : "border-stone-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold leading-snug text-stone-900">
            {deal.managerName}
          </div>
          <div className="truncate text-xs text-stone-500">{deal.fundName}</div>
        </div>
        <span
          title={`Deal lead: ${deal.lead.name}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-100 text-[10px] font-semibold text-accent-800"
        >
          {initials(deal.lead.name)}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
          {deal.assetClass.name}
        </span>
        <span className="rounded bg-accent-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent-800">
          {fmtMm(deal.targetSizeMm)}
        </span>
        {onHold && (
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
            On hold
          </span>
        )}
        {passed && (
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">
            Passed
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-stone-400">
        <span className={days > 30 && !passed ? "font-medium text-amber-600" : ""}>
          {days}d in stage
        </span>
        {deal.openFollowUps > 0 && (
          <span
            title={`${deal.openFollowUps} open follow-up${deal.openFollowUps > 1 ? "s" : ""}`}
            className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700"
          >
            {deal.openFollowUps} open
          </span>
        )}
      </div>
    </Link>
  );
}
