import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { UPLOAD_ROOT } from "@/lib/uploads";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "content-length": String(size),
      "content-disposition": `attachment; filename="${encodeURIComponent(doc.name)}"`,
      "content-type": "application/octet-stream",
    },
  });
}
