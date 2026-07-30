import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { UPLOAD_ROOT } from "@/lib/uploads";
import { generatePdfPreview } from "@/lib/convert";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Persist an uploaded file as the next version of a deal document, generating
 * a PDF preview for Office formats. Returns the created Document row.
 */
export async function saveDocumentFile(
  dealId: string,
  kind: string,
  fileName: string,
  bytes: Buffer,
  uploadedById: string,
  note?: string | null
) {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("File too large (25 MB max)");

  const last = await db.document.findFirst({
    where: { dealId, kind },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  const safeName = fileName.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const relPath = path.join(dealId, `${kind.toLowerCase()}-v${version}-${safeName}`);
  const absPath = path.join(UPLOAD_ROOT, relPath);
  await mkdir(path.dirname(absPath), { recursive: true });
  await writeFile(absPath, bytes);
  const previewPath = await generatePdfPreview(relPath);

  return db.document.create({
    data: {
      dealId,
      kind,
      version,
      note: note ?? null,
      uploadedById,
      type: "FILE",
      name: fileName,
      path: relPath,
      url: null,
      previewPath,
    },
  });
}
