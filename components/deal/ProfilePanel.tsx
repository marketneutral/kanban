import type { DeckProfile } from "@/lib/ai";
import type { QuintileRow } from "@/components/charts/FundHistoryChart";
import { fmtDate, initials } from "@/lib/format";
import ReturnChart from "@/components/charts/ReturnChart";
import FundHistoryChart from "@/components/charts/FundHistoryChart";

const TYPE_LABELS: Record<string, string> = {
  HEDGE_FUND: "Hedge fund",
  PRIVATE_MARKETS: "Private markets",
  OTHER: "Manager",
};

export default function ProfilePanel({
  profile,
  managerType,
  model,
  createdAt,
  createdBy,
  sourceDocId,
  sourceDocName,
  quintiles,
  quintilesName,
  fundLabel,
}: {
  profile: DeckProfile;
  managerType: string;
  model: string;
  createdAt: Date;
  createdBy: string;
  sourceDocId: string | null;
  sourceDocName: string | null;
  quintiles: QuintileRow[] | null;
  quintilesName: string | null;
  fundLabel: string;
}) {
  const { firm, keyPeople, keyTerms, deadlines, trackRecord } = profile;
  const now = Date.now();
  const hasReturns = trackRecord.returnsSeries.length >= 2;
  const hasFunds = trackRecord.funds.length > 0;

  return (
    <section className="rounded-xl border border-accent-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-accent-800">
          ✨ Manager profile
        </h2>
        <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-800">
          {TYPE_LABELS[managerType] ?? managerType}
        </span>
        <span className="ml-auto text-[11px] text-stone-400">
          extracted{sourceDocName ? ` from ` : ""}
          {sourceDocName && sourceDocId ? (
            <a href={`/documents/${sourceDocId}`} className="text-accent-700 hover:underline">
              {sourceDocName}
            </a>
          ) : (
            sourceDocName
          )}
        </span>
      </div>

      {profile.summary && (
        <p className="mt-3 text-sm leading-relaxed text-stone-700">{profile.summary}</p>
      )}

      {(firm.aum || firm.founded || firm.headquarters) && (
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {firm.aum && <Fact label="Firm AUM" value={firm.aum} />}
          {firm.founded && <Fact label="Founded" value={firm.founded} />}
          {firm.headquarters && <Fact label="Headquarters" value={firm.headquarters} />}
        </dl>
      )}

      {keyPeople.length > 0 && (
        <>
          <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-stone-400">
            Key people
          </h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {keyPeople.map((p) => (
              <li key={p.name} className="flex gap-2.5 rounded-lg bg-stone-50 p-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-100 text-[11px] font-semibold text-accent-800">
                  {initials(p.name)}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-stone-900">
                    {p.name}
                    <span className="ml-1.5 font-normal text-stone-500">{p.role}</span>
                  </p>
                  {p.background && (
                    <p className="text-[12px] leading-snug text-stone-500">{p.background}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {keyTerms.length > 0 && (
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-stone-400">
              Key terms
            </h3>
            <dl className="mt-2 divide-y divide-stone-100 text-[13px]">
              {keyTerms.map((t) => (
                <div key={t.term} className="flex justify-between gap-3 py-1.5">
                  <dt className="text-stone-500">{t.term}</dt>
                  <dd className="text-right font-medium text-stone-800">{t.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {deadlines.length > 0 && (
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-stone-400">
              Known deadlines
            </h3>
            <ul className="mt-2 space-y-1.5 text-[13px]">
              {deadlines.map((d, i) => {
                const dt = d.date ? new Date(`${d.date}T00:00:00Z`) : null;
                const soon =
                  dt && dt.getTime() > now && dt.getTime() - now < 60 * 86_400_000;
                const past = dt && dt.getTime() < now;
                return (
                  <li key={i} className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${
                        soon
                          ? "bg-amber-100 text-amber-700"
                          : past
                            ? "bg-stone-100 text-stone-400 line-through"
                            : "bg-stone-100 text-stone-600"
                      }`}
                    >
                      {d.date ? fmtDate(dt!) : "TBD"}
                    </span>
                    <span className={past ? "text-stone-400" : "text-stone-700"}>{d.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {(hasReturns || hasFunds) && (
        <>
          <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-wide text-stone-400">
            Track record
          </h3>
          <div className="mt-2 space-y-4">
            {hasReturns && (
              <ReturnChart
                series={trackRecord.returnsSeries}
                fundLabel={fundLabel}
                benchmarkName={trackRecord.benchmarkName}
              />
            )}
            {hasFunds && (
              <FundHistoryChart
                funds={trackRecord.funds}
                quintiles={quintiles}
                benchmarkName={quintilesName}
              />
            )}
          </div>
        </>
      )}

      {profile.notes && (
        <p className="mt-4 rounded-lg bg-stone-50 p-3 text-[12px] italic leading-relaxed text-stone-500">
          Extraction notes: {profile.notes}
        </p>
      )}

      <footer className="mt-3 text-[11px] text-stone-400">
        {model} · built by {createdBy} · {fmtDate(createdAt)} · figures transcribed from the
        deck, not verified
      </footer>
    </section>
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
