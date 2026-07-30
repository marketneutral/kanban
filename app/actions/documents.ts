"use server";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserAction } from "@/lib/session";
import { canManageDeals, hasRole, isAdmin, DOC_KINDS, type DocKind } from "@/lib/types";
import { UPLOAD_ROOT } from "@/lib/uploads";

const OPS_KINDS: DocKind[] = ["DDQ", "ODD_REPORT"];
const LEGAL_KINDS: DocKind[] = ["LPA", "SUB_DOCS"];

function canUploadKind(user: { roles: { role: string }[] }, kind: DocKind): boolean {
  if (isAdmin(user)) return true;
  if (OPS_KINDS.includes(kind)) return hasRole(user, "OPS");
  if (LEGAL_KINDS.includes(kind)) return hasRole(user, "LEGAL");
  return canManageDeals(user);
}

export async function addDocument(formData: FormData) {
  const user = await requireUserAction();
  const dealId = String(formData.get("dealId") ?? "");
  const kind = String(formData.get("kind") ?? "") as DocKind;
  if (!DOC_KINDS.includes(kind)) throw new Error("Unknown document kind");
  if (!canUploadKind(user, kind)) throw new Error("Your role cannot attach this document kind");

  await db.deal.findUniqueOrThrow({ where: { id: dealId } });

  const note = String(formData.get("note") ?? "").trim() || null;
  const url = String(formData.get("url") ?? "").trim();
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  if (!hasFile && !url) throw new Error("Attach a file or provide a link");

  const last = await db.document.findFirst({
    where: { dealId, kind },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  let data;
  if (hasFile) {
    const f = file as File;
    if (f.size > 25 * 1024 * 1024) throw new Error("File too large (25 MB max)");
    const safeName = f.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
    const relPath = path.join(dealId, `${kind.toLowerCase()}-v${version}-${safeName}`);
    const absPath = path.join(UPLOAD_ROOT, relPath);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, Buffer.from(await f.arrayBuffer()));
    data = { type: "FILE", name: f.name, path: relPath, url: null };
  } else {
    if (!/^https?:\/\//i.test(url)) throw new Error("Link must start with http(s)://");
    const name = String(formData.get("name") ?? "").trim() || url;
    data = { type: "LINK", name, path: null, url };
  }

  await db.document.create({
    data: { dealId, kind, version, note, uploadedById: user.id, ...data },
  });
  await db.stageEvent.create({
    data: {
      dealId,
      actorId: user.id,
      action: "DOCUMENT_ADDED",
      detail: JSON.stringify({ kind, version, name: data.name }),
    },
  });
  revalidatePath("/board");
  revalidatePath(`/deals/${dealId}`);
}
