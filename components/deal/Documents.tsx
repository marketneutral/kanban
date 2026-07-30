import { DOC_KINDS, DOC_KIND_LABELS, type DocKind } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { addDocument } from "@/app/actions/documents";

type Doc = {
  id: string;
  kind: string;
  type: string;
  name: string;
  version: number;
  note: string | null;
  createdAt: Date;
  uploadedBy: { name: string };
};

export default function Documents({
  dealId,
  documents,
  canAttach,
}: {
  dealId: string;
  documents: Doc[];
  canAttach: boolean;
}) {
  const byKind = new Map<string, Doc[]>();
  for (const d of documents) {
    if (!byKind.has(d.kind)) byKind.set(d.kind, []);
    byKind.get(d.kind)!.push(d);
  }
  for (const list of byKind.values()) list.sort((a, b) => b.version - a.version);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-stone-400">
        Documents
      </h2>

      {documents.length === 0 && (
        <p className="mt-3 text-sm text-stone-400">Nothing attached yet.</p>
      )}

      <div className="mt-3 space-y-4">
        {DOC_KINDS.filter((k) => byKind.has(k)).map((kind) => (
          <div key={kind}>
            <h3 className="text-[12px] font-semibold text-stone-500">
              {DOC_KIND_LABELS[kind as DocKind]}
            </h3>
            <ul className="mt-1.5 space-y-1.5">
              {byKind.get(kind)!.map((d, i) => (
                <li
                  key={d.id}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm ${
                    i === 0 ? "border-stone-200 bg-white" : "border-stone-100 bg-stone-50 opacity-70"
                  }`}
                >
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-stone-500">
                    v{d.version}
                  </span>
                  <a
                    href={d.type === "LINK" ? `/api/documents/${d.id}` : `/documents/${d.id}`}
                    target={d.type === "LINK" ? "_blank" : undefined}
                    className="min-w-0 flex-1 truncate font-medium text-accent-700 hover:underline"
                  >
                    {d.type === "LINK" ? "🔗 " : ""}
                    {d.name}
                  </a>
                  <span className="shrink-0 text-[11px] text-stone-400">
                    {d.uploadedBy.name} · {fmtDate(d.createdAt)}
                  </span>
                  {d.type === "FILE" && (
                    <a
                      href={`/api/documents/${d.id}?dl=1`}
                      title="Download"
                      className="shrink-0 rounded px-1 text-stone-300 hover:bg-stone-100 hover:text-stone-600"
                    >
                      ↓
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {canAttach && (
        <form
          action={addDocument}
          className="mt-4 grid gap-2 rounded-lg bg-stone-50 p-3"
        >
          <input type="hidden" name="dealId" value={dealId} />
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              name="kind"
              required
              defaultValue=""
              className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] shadow-sm focus:border-accent-400 focus:outline-none"
            >
              <option value="" disabled>
                Document kind…
              </option>
              {DOC_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DOC_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              type="file"
              name="file"
              className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[13px] text-stone-500 shadow-sm file:mr-2 file:rounded file:border-0 file:bg-stone-100 file:px-2 file:py-1 file:text-[12px] file:font-medium file:text-stone-600"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              name="url"
              placeholder="…or paste a link (https://)"
              className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] shadow-sm placeholder:text-stone-400 focus:border-accent-400 focus:outline-none"
            />
            <input
              name="name"
              placeholder="Display name for the link"
              className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] shadow-sm placeholder:text-stone-400 focus:border-accent-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-md bg-accent-700 px-3 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-accent-800">
              Attach
            </button>
            <p className="text-[11px] text-stone-400">
              Re-attaching the same kind creates a new version. Ops attaches DDQ/ODD; Legal
              attaches LPA/sub docs.
            </p>
          </div>
        </form>
      )}
    </section>
  );
}
