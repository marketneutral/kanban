import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { UPLOAD_ROOT } from "@/lib/uploads";

// Types we let the browser render inline; everything else downloads.
// (SVG is deliberately excluded — inline user-uploaded SVG can run scripts.)
const INLINE_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");

  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) notFound();
  if (doc.type === "LINK" && doc.url) redirect(doc.url);
  if (!doc.path) notFound();

  const abs = path.normalize(path.join(UPLOAD_ROOT, doc.path));
  if (!abs.startsWith(UPLOAD_ROOT)) notFound();

  let size: number;
  try {
    size = (await stat(abs)).size;
  } catch {
    notFound();
  }

  const forceDownload = new URL(req.url).searchParams.has("dl");
  const inlineType = INLINE_TYPES[path.extname(doc.name).toLowerCase()];
  const disposition = !forceDownload && inlineType ? "inline" : "attachment";
  const contentType = inlineType ?? "application/octet-stream";

  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "content-length": String(size),
      "content-disposition": `${disposition}; filename="${encodeURIComponent(doc.name)}"`,
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    },
  });
}
