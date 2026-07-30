import Link from "next/link";
import path from "path";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { DOC_KIND_LABELS, type DocKind } from "@/lib/types";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const PDF = new Set([".pdf"]);
const IMAGE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export default async function DocumentViewerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const doc = await db.document.findUnique({
    where: { id },
    include: { deal: true, uploadedBy: true },
  });
  if (!doc) notFound();
  if (doc.type === "LINK" && doc.url) redirect(doc.url);

  const versions = await db.document.findMany({
    where: { dealId: doc.dealId, kind: doc.kind },
    orderBy: { version: "desc" },
    select: { id: true, version: true, type: true },
  });

  const ext = path.extname(doc.name).toLowerCase();
  const src = `/api/documents/${doc.id}`;
  const kindLabel = DOC_KIND_LABELS[doc.kind as DocKind] ?? doc.kind;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200 bg-white px-5 py-3">
        <div className="min-w-0">
          <Link
            href={`/deals/${doc.dealId}`}
            className="text-[12px] text-stone-500 hover:text-stone-800"
          >
            ← {doc.deal.managerName} · {doc.deal.fundName}
          </Link>
          <h1 className="truncate text-[15px] font-semibold tracking-tight text-stone-900">
            {doc.name}
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="rounded bg-stone-100 px-2 py-1 text-[12px] font-medium text-stone-600">
            {kindLabel}
          </span>
          {versions.length > 1 && (
            <nav className="flex items-center gap-1" aria-label="Versions">
              {versions.map((v) => (
                <Link
                  key={v.id}
                  href={`/documents/${v.id}`}
                  className={`rounded px-2 py-1 font-mono text-[12px] font-semibold ${
                    v.id === doc.id
                      ? "bg-accent-700 text-white"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                  }`}
                >
                  v{v.version}
                </Link>
              ))}
            </nav>
          )}
          <span className="hidden text-[12px] text-stone-400 sm:block">
            {doc.uploadedBy.name} · {fmtDate(doc.createdAt)}
          </span>
          <a
            href={`${src}?dl=1`}
            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-700 shadow-sm hover:bg-stone-50"
          >
            Download
          </a>
        </div>
        {doc.note && (
          <p className="w-full text-[12px] italic text-stone-500">“{doc.note}”</p>
        )}
      </header>

      <div className="min-h-0 flex-1 bg-stone-200">
        {doc.previewPath && !PDF.has(ext) ? (
          <div className="flex h-full flex-col">
            <p className="border-b border-amber-100 bg-amber-50 px-5 py-1.5 text-center text-[12px] text-amber-800">
              Converted PDF preview — formatting may differ.{" "}
              <a href={`${src}?dl=1`} className="font-medium underline">
                Download the original {ext} file
              </a>
            </p>
            <iframe
              src={`${src}?preview=1`}
              title={doc.name}
              className="min-h-0 w-full flex-1 border-0"
            />
          </div>
        ) : PDF.has(ext) ? (
          <iframe src={src} title={doc.name} className="h-full w-full border-0" />
        ) : IMAGE.has(ext) ? (
          <div className="grid h-full place-items-center overflow-auto p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={doc.name}
              className="max-h-full max-w-full rounded-lg bg-white shadow-lg"
            />
          </div>
        ) : (
          <div className="grid h-full place-items-center">
            <div className="text-center">
              <p className="text-4xl">📄</p>
              <p className="mt-3 text-sm text-stone-600">
                No inline preview for <span className="font-mono">{ext || "this file type"}</span>.
              </p>
              <a
                href={`${src}?dl=1`}
                className="mt-4 inline-block rounded-md bg-accent-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-800"
              >
                Download {doc.name}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
