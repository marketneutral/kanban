/**
 * Prior-fund DPI/TVPI by vintage year with benchmark TVPI quintile bands,
 * server-rendered SVG. Palette validated (dataviz six checks): fund #2f6fa8
 * (Columbia blue ramp).
 */

type Fund = {
  name: string;
  vintage: number | null;
  sizeMm: number | null;
  netIrrPct: number | null;
  dpi: number | null;
  tvpi: number | null;
  status: string;
};

export type QuintileRow = { vintage: number; q: [number, number, number, number] };

const FUND = "#2f6fa8";
const W = 640;
const H = 260;
const PAD = { l: 40, r: 96, t: 12, b: 26 };

export default function FundHistoryChart({
  funds,
  quintiles,
  benchmarkName,
}: {
  funds: Fund[];
  quintiles: QuintileRow[] | null;
  benchmarkName: string | null;
}) {
  const plotted = funds.filter((f) => f.vintage !== null && (f.tvpi !== null || f.dpi !== null));
  if (plotted.length === 0) return null;

  const vintages = plotted.map((f) => f.vintage!);
  const qRows = (quintiles ?? [])
    .filter((r) => r.vintage >= Math.min(...vintages) - 1 && r.vintage <= Math.max(...vintages) + 1)
    .sort((a, b) => a.vintage - b.vintage);

  const xMin = Math.min(...vintages, ...(qRows.length ? [qRows[0]!.vintage] : [])) - 0.6;
  const xMax = Math.max(...vintages, ...(qRows.length ? [qRows[qRows.length - 1]!.vintage] : [])) + 0.6;
  const yMax =
    Math.max(
      ...plotted.map((f) => Math.max(f.tvpi ?? 0, f.dpi ?? 0)),
      ...qRows.map((r) => r.q[3]),
      1
    ) * 1.15;

  const x = (v: number) => PAD.l + ((W - PAD.l - PAD.r) * (v - xMin)) / (xMax - xMin);
  const y = (m: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - m / yMax);

  const bandPath = (lower: (r: QuintileRow) => number, upper: (r: QuintileRow) => number) => {
    const up = qRows.map((r) => `${x(r.vintage).toFixed(1)},${y(upper(r)).toFixed(1)}`);
    const down = [...qRows].reverse().map((r) => `${x(r.vintage).toFixed(1)},${y(lower(r)).toFixed(1)}`);
    return `M${up.join(" L")} L${down.join(" L")} Z`;
  };

  const gridVals: number[] = [];
  for (let v = 0.5; v < yMax; v += 0.5) gridVals.push(v);

  const yearTicks: number[] = [];
  for (let v = Math.ceil(xMin); v <= Math.floor(xMax); v++) yearTicks.push(v);
  const keepEvery = Math.ceil(yearTicks.length / 9);
  const ticks = yearTicks.filter((_, i) => i % keepEvery === 0);

  return (
    <figure>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-stone-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: FUND }} />
          TVPI (total value)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full border-2 bg-white"
            style={{ borderColor: FUND }}
          />
          DPI (realized)
        </span>
        {qRows.length > 0 && (
          <span className="flex items-center gap-1.5 text-stone-400">
            <span className="h-2.5 w-3 rounded-sm bg-stone-200/80" />
            {benchmarkName ?? "Benchmark"} TVPI quintiles
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 w-full"
        role="img"
        aria-label="Prior fund DPI and TVPI multiples by vintage year"
      >
        {qRows.length > 1 && (
          <>
            <path d={bandPath((r) => r.q[2], (r) => r.q[3])} fill="#e7e5e4" opacity="0.55" />
            <path d={bandPath((r) => r.q[1], (r) => r.q[2])} fill="#e7e5e4" opacity="0.85" />
            <path d={bandPath((r) => r.q[0], (r) => r.q[1])} fill="#e7e5e4" opacity="0.55" />
            <text
              x={x(qRows[qRows.length - 1]!.vintage) + 6}
              y={y(qRows[qRows.length - 1]!.q[3]) + 3}
              fontSize="9"
              fill="#a8a29e"
            >
              top quintile
            </text>
            <text
              x={x(qRows[qRows.length - 1]!.vintage) + 6}
              y={y(qRows[qRows.length - 1]!.q[0]) + 3}
              fontSize="9"
              fill="#a8a29e"
            >
              bottom quintile
            </text>
            <text
              x={x(qRows[qRows.length - 1]!.vintage) + 6}
              y={(y(qRows[qRows.length - 1]!.q[1]) + y(qRows[qRows.length - 1]!.q[2])) / 2 + 3}
              fontSize="9"
              fill="#a8a29e"
            >
              median
            </text>
          </>
        )}
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#e7e5e4" strokeWidth="1" strokeDasharray="2 3" />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#a8a29e">
              {v.toFixed(1)}x
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(1)} y2={y(1)} stroke="#d6d3d1" strokeWidth="1" />
        {ticks.map((v) => (
          <text key={v} x={x(v)} y={H - 8} textAnchor="middle" fontSize="10" fill="#a8a29e">
            {v}
          </text>
        ))}
        {plotted.map((f) => {
          const cx = x(f.vintage!);
          const tooltip = `${f.name} (${f.vintage})${f.sizeMm ? ` · $${f.sizeMm}mm` : ""}${
            f.netIrrPct !== null ? ` · net IRR ${f.netIrrPct}%` : ""
          }${f.dpi !== null ? ` · DPI ${f.dpi.toFixed(2)}x` : ""}${
            f.tvpi !== null ? ` · TVPI ${f.tvpi.toFixed(2)}x` : ""
          }${f.status ? ` · ${f.status}` : ""}`;
          return (
            <g key={f.name}>
              {f.dpi !== null && f.tvpi !== null && (
                <line x1={cx} x2={cx} y1={y(f.dpi)} y2={y(f.tvpi)} stroke={FUND} strokeWidth="1.5" opacity="0.5" />
              )}
              {f.tvpi !== null && (
                <circle cx={cx} cy={y(f.tvpi)} r="5" fill={FUND} stroke="#ffffff" strokeWidth="2" />
              )}
              {f.dpi !== null && (
                <circle cx={cx} cy={y(f.dpi)} r="5" fill="#ffffff" stroke={FUND} strokeWidth="2" />
              )}
              {f.tvpi !== null && (
                <text
                  x={cx}
                  y={y(f.tvpi) - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#57534e"
                >
                  {f.name.replace(/^.*\b(Fund|[IVX]+)$/i, (m) => m)}
                </text>
              )}
              <rect
                x={cx - 12}
                y={PAD.t}
                width="24"
                height={H - PAD.t - PAD.b}
                fill="transparent"
              >
                <title>{tooltip}</title>
              </rect>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-[11px] text-stone-400">
        Multiples as stated in the deck.{" "}
        {qRows.length > 1 && `Quintile bands: ${benchmarkName ?? "benchmark"}.`}
      </figcaption>
      {/* accessible table view */}
      <table className="mt-3 w-full text-[12px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-stone-400">
            <th className="py-1 pr-2 font-semibold">Fund</th>
            <th className="py-1 pr-2 text-right font-semibold">Vintage</th>
            <th className="py-1 pr-2 text-right font-semibold">Size $mm</th>
            <th className="py-1 pr-2 text-right font-semibold">Net IRR</th>
            <th className="py-1 pr-2 text-right font-semibold">DPI</th>
            <th className="py-1 pr-2 text-right font-semibold">TVPI</th>
            <th className="py-1 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 text-stone-700">
          {funds.map((f) => (
            <tr key={f.name}>
              <td className="py-1 pr-2 font-medium">{f.name}</td>
              <td className="py-1 pr-2 text-right">{f.vintage ?? "—"}</td>
              <td className="py-1 pr-2 text-right">{f.sizeMm?.toLocaleString() ?? "—"}</td>
              <td className="py-1 pr-2 text-right">
                {f.netIrrPct !== null ? `${f.netIrrPct}%` : "—"}
              </td>
              <td className="py-1 pr-2 text-right">{f.dpi !== null ? `${f.dpi.toFixed(2)}x` : "—"}</td>
              <td className="py-1 pr-2 text-right">{f.tvpi !== null ? `${f.tvpi.toFixed(2)}x` : "—"}</td>
              <td className="py-1 text-stone-500">{f.status || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
