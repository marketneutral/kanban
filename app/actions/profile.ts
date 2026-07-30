"use server";

import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserAction } from "@/lib/session";
import { canManageDeals } from "@/lib/types";
import { aiConfigured, runDeckExtraction, AI_MODEL, type DeckProfile } from "@/lib/ai";
import { extractDocumentText, TEXT_EXTRACT_EXTS } from "@/lib/extract";
import { generatePdfPreview } from "@/lib/convert";
import { saveDocumentFile, MAX_UPLOAD_BYTES } from "@/lib/documents";
import { UPLOAD_ROOT } from "@/lib/uploads";

const MANAGER_TYPE_TO_CLASS_HINT: Record<string, string[]> = {
  HEDGE_FUND: ["Multi-Strategy", "Equity Long/Short"],
  PRIVATE_MARKETS: ["Private Equity"],
  OTHER: [],
};

async function extractFromUpload(file: File): Promise<{ profile: DeckProfile }> {
  const assetClasses = await db.assetClass.findMany({ orderBy: { name: "asc" } });

  // Stage the upload so LibreOffice conversion (pptx etc.) can run on it.
  const ext = path.extname(file.name).toLowerCase();
  const incomingRel = path.join("_incoming", randomUUID(), `deck${ext}`);
  const incomingAbs = path.join(UPLOAD_ROOT, incomingRel);
  await mkdir(path.dirname(incomingAbs), { recursive: true });
  await writeFile(incomingAbs, Buffer.from(await file.arrayBuffer()));

  try {
    let previewAbs: string | null = null;
    if (!TEXT_EXTRACT_EXTS.has(ext)) {
      const previewRel = await generatePdfPreview(incomingRel);
      if (!previewRel) {
        throw new Error(
          `Couldn't convert ${ext || "this file"} for extraction — upload a PDF or .docx instead`
        );
      }
      previewAbs = path.join(UPLOAD_ROOT, previewRel);
    }
    const text = await extractDocumentText(incomingAbs, previewAbs);
    const profile = await runDeckExtraction(
      text,
      assetClasses.map((a) => a.name)
    );
    return { profile };
  } finally {
    await rm(path.dirname(incomingAbs), { recursive: true, force: true }).catch(() => {});
  }
}

async function resolveAssetClassId(name: string, managerType: string): Promise<string> {
  const classes = await db.assetClass.findMany();
  const match = classes.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (match) return match.id;
  for (const hint of MANAGER_TYPE_TO_CLASS_HINT[managerType] ?? []) {
    const h = classes.find((c) => c.name === hint);
    if (h) return h.id;
  }
  return classes[0]!.id;
}

/**
 * ✨ Create a deal card from a pitch deck: extracts the card fields and a full
 * manager profile, creates the deal, and attaches the deck as a document.
 */
export async function createDealFromDeck(formData: FormData) {
  const user = await requireUserAction();
  if (!canManageDeals(user)) throw new Error("Not permitted");

  const file = formData.get("file");
  let dealId: string;
  try {
    if (!aiConfigured()) throw new Error("AI is not configured on the server");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a deck to upload");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("File too large (25 MB max)");

    const { profile } = await extractFromUpload(file);
    if (!profile.card.managerName.trim()) {
      throw new Error("The deck didn't yield a manager name — create the deal manually");
    }

    const assetClassId = await resolveAssetClassId(
      profile.card.assetClassName,
      profile.managerType
    );

    const deal = await db.deal.create({
      data: {
        managerName: profile.card.managerName.trim(),
        fundName: profile.card.fundName.trim() || profile.card.managerName.trim(),
        strategy: profile.card.strategy.trim() || null,
        targetSizeMm: profile.card.targetSizeMm,
        assetClassId,
        leadId: user.id,
        source: "Pitch deck upload",
        notes: profile.summary,
        events: {
          create: [
            { actorId: user.id, action: "DEAL_CREATED" },
            {
              actorId: user.id,
              action: "AI_PROFILE_BUILT",
              detail: JSON.stringify({ from: file.name, managerType: profile.managerType }),
            },
          ],
        },
      },
    });
    dealId = deal.id;

    const doc = await saveDocumentFile(
      deal.id,
      "PITCH_DECK",
      file.name,
      Buffer.from(await file.arrayBuffer()),
      user.id,
      "Uploaded via ✨ create-from-deck"
    );

    await db.dealProfile.create({
      data: {
        dealId: deal.id,
        sourceDocumentId: doc.id,
        managerType: profile.managerType,
        data: JSON.stringify(profile),
        model: AI_MODEL,
        createdById: user.id,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Extraction failed";
    redirect(`/deals/new?aiError=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/board");
  redirect(`/deals/${dealId}`);
}

/** Re-run profile extraction from a deck already attached to a deal. */
export async function buildProfileFromDocument(formData: FormData) {
  const user = await requireUserAction();
  if (!canManageDeals(user)) throw new Error("Not permitted");
  if (!aiConfigured()) throw new Error("AI is not configured on the server");

  const documentId = String(formData.get("documentId") ?? "");
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });
  if (doc.type !== "FILE" || !doc.path) throw new Error("Profiles need an uploaded file");

  const assetClasses = await db.assetClass.findMany({ orderBy: { name: "asc" } });
  const text = await extractDocumentText(
    path.join(UPLOAD_ROOT, doc.path),
    doc.previewPath ? path.join(UPLOAD_ROOT, doc.previewPath) : null
  );
  const profile = await runDeckExtraction(
    text,
    assetClasses.map((a) => a.name)
  );

  await db.dealProfile.upsert({
    where: { dealId: doc.dealId },
    update: {
      sourceDocumentId: doc.id,
      managerType: profile.managerType,
      data: JSON.stringify(profile),
      model: AI_MODEL,
      createdById: user.id,
    },
    create: {
      dealId: doc.dealId,
      sourceDocumentId: doc.id,
      managerType: profile.managerType,
      data: JSON.stringify(profile),
      model: AI_MODEL,
      createdById: user.id,
    },
  });
  await db.stageEvent.create({
    data: {
      dealId: doc.dealId,
      actorId: user.id,
      action: "AI_PROFILE_BUILT",
      detail: JSON.stringify({ from: doc.name, managerType: profile.managerType }),
    },
  });
  revalidatePath(`/deals/${doc.dealId}`);
}
