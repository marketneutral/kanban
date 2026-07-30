/**
 * Cumulative net return line chart (fund vs. benchmark), server-rendered SVG.
 * Palette validated (dataviz six checks): fund #2f6fa8 (Columbia blue ramp),
 * benchmark #b45309.
 */

type Point = { period: string; fundPct: number; benchmarkPct: number | null };

const FUND = "#2f6fa8";
const BENCH = "#b45309";
const W = 640;
const H = 240;
const PAD = { l: 44, r: 8, t: 10, b: 22 };

function periodsPerYear(series: Point[]): number {
  const p = series[0]?.period ?? "";
  if (/^\d{4}$/.test(p)) return 1;
  if (series.length >= 2) {
    const [a, b] = [series[0]!.period, series[1]!.period].map((s) => {
      const [y, m] = s.split("-").map(Number);
      return y! * 12 + (m ?? 1);
    });
    const step = Math.abs(b! - a!) || 1;
    return Math.max(1, Math.round(12 / step));
  }
  return 12;
}

function cumulate(returnsPct: number[]): number[] {
  const out: number[] = [];
  let v = 100;
  for (const r of returnsPct) {
    v *= 1 + r / 100;
    out.push(v);
  }
  return out;
}

function stats(returnsPct: number[], ppy: number) {
  const n = returnsPct.length;
  if (n === 0) return null;
  const growth = returnsPct.reduce((a, r) => a * (1 + r / 100), 1);
  const cagr = (Math.pow(growth, ppy / n) - 1) * 100;
  const mean = returnsPct.reduce((a, r) => a + r, 0) / n;
  const vol =
    Math.sqrt(returnsPct.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(1, n - 1)) *
    Math.sqrt(ppy);
  const sharpe = vol > 0 ? (cagr / vol) : 0;
  let peak = 100;
  let maxDd = 0;
  let v = 100;
  for (const r of returnsPct) {
    v *= 1 + r / 100;
    peak = Math.max(peak, v);
    maxDd = Math.min(maxDd, (v / peak - 1) * 100);
  }
  return { cagr, vol, sharpe, maxDd };
}

export default function ReturnChart({
  series,
  fundLabel,
  benchmarkName,
}: {
  series: Point[];
  fundLabel: string;
  benchmarkName: string;
}) {
  if (series.length < 2) return null;
  const ppy = periodsPerYear(series);
  const fundCum = cumulate(series.map((p) => p.fundPct));
  const hasBench = series.every((p) => p.benchmarkPct !== null) && !!benchmarkName;
  const benchCum = hasBench ? cumulate(series.map((p) => p.benchmarkPct!)) : null;

  const all = [100, ...fundCum, ...(benchCum ?? [])];
  const yMin = Math.min(...all) * 0.97;
  const yMax = Math.max(...all) * 1.03;
  const x = (i: number) => PAD.l + ((W - PAD.l - PAD.r) * i) / (series.length - 1);
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - yMin) / (yMax - yMin));

  const line = (vals: number[]) => vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  // y gridlines: 4 round values
  const gridVals: number[] = [];
  const step = Math.pow(10, Math.floor(Math.log10((yMax - yMin) / 4)));
  const inc = Math.ceil((yMax - yMin) / 4 / step) * step;
  for (let v = Math.ceil(yMin / inc) * inc; v <= yMax; v += inc) gridVals.push(v);

  // x ticks at year boundaries (max ~8 labels)
  const years = series.map((p) => p.period.slice(0, 4));
  const tickIdx: number[] = [];
  years.forEach((yr, i) => {
    if (i === 0 || yr !== years[i - 1]) tickIdx.push(i);
  });
  const keepEvery = Math.ceil(tickIdx.length / 8);
  const ticks = tickIdx.filter((_, i) => i % keepEvery === 0);

  const fundStats = stats(series.map((p) => p.fundPct), ppy)!;

  return (
    <figure>
      <div className="flex items-center gap-4 text-[12px] text-stone-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: FUND }} />
          {fundLabel}
        </span>
        {hasBench && (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: BENCH }} />
            {benchmarkName}
          </span>
        )}
        <span className="ml-auto text-stone-400">Growth of 100, net</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 w-full"
        role="img"
        aria-label={`Cumulative net return of ${fundLabel}${hasBench ? ` versus ${benchmarkName}` : ""}`}
      >
        {gridVals.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y(v)}
              y2={y(v)}
              stroke="#e7e5e4"
              strokeWidth="1"
            />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#a8a29e">
              {Math.round(v)}
            </text>
          </g>
        ))}
        {ticks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize="10"
            fill="#a8a29e"
          >
            {years[i]}
          </text>
        ))}
        {benchCum && (
          <polyline points={line(benchCum)} fill="none" stroke={BENCH} strokeWidth="2" strokeLinejoin="round" />
        )}
        <polyline points={line(fundCum)} fill="none" stroke={FUND} strokeWidth="2" strokeLinejoin="round" />
        {/* hover targets */}
        {series.map((p, i) => (
          <g key={p.period}>
            <circle cx={x(i)} cy={y(fundCum[i]!)} r="8" fill="transparent">
              <title>
                {`${p.period} — ${fundLabel}: ${p.fundPct >= 0 ? "+" : ""}${p.fundPct.toFixed(2)}% (index ${fundCum[i]!.toFixed(1)})${
                  hasBench ? `; ${benchmarkName}: ${p.benchmarkPct! >= 0 ? "+" : ""}${p.benchmarkPct!.toFixed(2)}%` : ""
                }`}
              </title>
            </circle>
          </g>
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500">
        <span>
          CAGR <span className="font-semibold text-stone-700">{fundStats.cagr.toFixed(1)}%</span>
        </span>
        <span>
          Ann. vol <span className="font-semibold text-stone-700">{fundStats.vol.toFixed(1)}%</span>
        </span>
        <span>
          Sharpe (0% rf){" "}
          <span className="font-semibold text-stone-700">{fundStats.sharpe.toFixed(2)}</span>
        </span>
        <span>
          Max drawdown{" "}
          <span className="font-semibold text-stone-700">{fundStats.maxDd.toFixed(1)}%</span>
        </span>
        <span className="text-stone-400">as stated in the deck</span>
      </figcaption>
    </figure>
  );
}
