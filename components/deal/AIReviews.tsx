import type { ReviewFinding } from "@/lib/ai";
import { DOC_KIND_LABELS, type DocKind } from "@/lib/types";
import { fmtDate } from "@/lib/format";

type Review = {
  id: string;
  status: string;
  assessment: string | null;
  summary: string | null;
  findings: string | null;
  error: string | null;
  model: string;
  createdAt: Date;
  requestedBy: { name: string };
  document: { name: string; kind: string; version: number };
};

const ASSESSMENT_STYLES: Record<string, string> = {
  STANDARD: "bg-emerald-50 text-emerald-700",
  NEGOTIABLE_ISSUES: "bg-amber-50 text-amber-700",
  SIGNIFICANT_CONCERNS: "bg-red-50 text-red-700",
};
const ASSESSMENT_LABELS: Record<string, string> = {
  STANDARD: "Broadly standard",
  NEGOTIABLE_ISSUES: "Negotiable issues",
  SIGNIFICANT_CONCERNS: "Significant concerns",
};
const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  caution: "bg-amber-100 text-amber-700",
  info: "bg-stone-100 text-stone-500",
};

export default function AIReviews({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null;

  return (
    <section className="rounded-xl border border-accent-200 bg-white p-5 shadow-sm">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-accent-800">
        ✨ AI document reviews
      </h2>
      <p className="mt-1 text-[12px] text-stone-400">
        Automated first-pass reads against the firm&apos;s standards — a lens to focus the
        professionals&apos; review, not a substitute for it.
      </p>

      <div className="mt-4 space-y-5">
        {reviews.map((r) => {
          const findings: ReviewFinding[] = r.findings ? JSON.parse(r.findings) : [];
          return (
            <article key={r.id} className="rounded-lg border border-stone-200 p-4">
              <header className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-stone-900">
                  {DOC_KIND_LABELS[r.document.kind as DocKind] ?? r.document.kind}
                </span>
                <span className="text-[12px] text-stone-400">
                  {r.document.name} · v{r.document.version}
                </span>
                {r.status === "COMPLETE" && r.assessment ? (
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${ASSESSMENT_STYLES[r.assessment] ?? "bg-stone-100 text-stone-500"}`}
                  >
                    {ASSESSMENT_LABELS[r.assessment] ?? r.assessment}
                  </span>
                ) : (
                  <span className="ml-auto rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                    Failed
                  </span>
                )}
              </header>

              {r.status === "COMPLETE" ? (
                <>
                  {r.summary && (
                    <p className="mt-2 text-sm leading-relaxed text-stone-700">{r.summary}</p>
                  )}
                  {findings.length > 0 && (
                    <ul className="mt-3 space-y-2.5">
                      {findings.map((f, i) => (
                        <li key={i} className="rounded-lg bg-stone-50 p-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.info}`}
                            >
                              {f.severity}
                            </span>
                            <span className="text-[13px] font-semibold text-stone-800">
                              {f.title}
                            </span>
                            <span className="ml-auto font-mono text-[11px] text-stone-400">
                              {f.clause}
                            </span>
                          </div>
                          {f.excerpt && (
                            <blockquote className="mt-1.5 border-l-2 border-stone-300 pl-2 text-[12px] italic text-stone-500">
                              “{f.excerpt}”
                            </blockquote>
                          )}
                          <p className="mt-1.5 text-[13px] text-stone-700">{f.concern}</p>
                          <p className="mt-1 text-[12px] text-accent-800">
                            <span className="font-semibold">Suggested:</span> {f.suggestion}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-red-600">{r.error}</p>
              )}

              <footer className="mt-3 text-[11px] text-stone-400">
                {r.model} · requested by {r.requestedBy.name} · {fmtDate(r.createdAt)}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
