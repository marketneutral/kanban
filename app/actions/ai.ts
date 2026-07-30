"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserAction } from "@/lib/session";
import { canManageDeals, hasRole, isAdmin } from "@/lib/types";
import { aiConfigured, runDocumentReview, runDevilsAdvocate, AI_MODEL } from "@/lib/ai";
import { guard } from "@/lib/action-guard";

export const requestDocumentReview = guard(requestDocumentReviewBody);
async function requestDocumentReviewBody(formData: FormData) {
  const user = await requireUserAction();
  if (!(canManageDeals(user) || hasRole(user, "LEGAL", "OPS"))) {
    throw new Error("Not permitted");
  }
  if (!aiConfigured()) {
    throw new Error(
      "AI review is not configured — set the AZURE_OPENAI_* environment variables on the server"
    );
  }

  const documentId = String(formData.get("documentId") ?? "");
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });

  try {
    const result = await runDocumentReview(documentId);
    await db.documentReview.create({
      data: {
        documentId,
        dealId: doc.dealId,
        model: AI_MODEL,
        status: "COMPLETE",
        assessment: result.assessment,
        summary: result.summary,
        findings: JSON.stringify(result.findings),
        requestedById: user.id,
      },
    });
    await db.stageEvent.create({
      data: {
        dealId: doc.dealId,
        actorId: user.id,
        action: "AI_REVIEW_RUN",
        detail: JSON.stringify({
          kind: doc.kind,
          name: doc.name,
          assessment: result.assessment,
          findings: result.findings.length,
        }),
      },
    });
  } catch (e) {
    await db.documentReview.create({
      data: {
        documentId,
        dealId: doc.dealId,
        model: AI_MODEL,
        status: "FAILED",
        error: e instanceof Error ? e.message : "Review failed",
        requestedById: user.id,
      },
    });
  }

  revalidatePath(`/deals/${doc.dealId}`);
}

export const requestDevilsAdvocate = guard(requestDevilsAdvocateBody);
async function requestDevilsAdvocateBody(formData: FormData) {
  const user = await requireUserAction();
  if (!(canManageDeals(user) || hasRole(user, "LEGAL", "OPS"))) {
    throw new Error("Not permitted");
  }
  if (!aiConfigured()) {
    throw new Error(
      "AI is not configured — set the AZURE_OPENAI_* environment variables on the server"
    );
  }

  const documentId = String(formData.get("documentId") ?? "");
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });

  try {
    const result = await runDevilsAdvocate(documentId);
    await db.documentReview.create({
      data: {
        documentId,
        dealId: doc.dealId,
        mode: "DEVILS_ADVOCATE",
        model: AI_MODEL,
        status: "COMPLETE",
        assessment: result.verdict,
        summary: result.bearCase,
        findings: JSON.stringify({
          rebuttals: result.rebuttals,
          keyQuestions: result.keyQuestions,
        }),
        requestedById: user.id,
      },
    });
    await db.stageEvent.create({
      data: {
        dealId: doc.dealId,
        actorId: user.id,
        action: "AI_DEVILS_ADVOCATE_RUN",
        detail: JSON.stringify({
          kind: doc.kind,
          name: doc.name,
          verdict: result.verdict,
          rebuttals: result.rebuttals.length,
        }),
      },
    });
  } catch (e) {
    await db.documentReview.create({
      data: {
        documentId,
        dealId: doc.dealId,
        mode: "DEVILS_ADVOCATE",
        model: AI_MODEL,
        status: "FAILED",
        error: e instanceof Error ? e.message : "Analysis failed",
        requestedById: user.id,
      },
    });
  }

  revalidatePath(`/deals/${doc.dealId}`);
}

export const updateReviewStandard = guard(updateReviewStandardBody);
async function updateReviewStandardBody(formData: FormData) {
  const user = await requireUserAction();
  if (!isAdmin(user)) throw new Error("Admin only");
  const id = String(formData.get("id") ?? "");
  const prompt = String(formData.get("prompt") ?? "").trim();
  if (!prompt) throw new Error("The standard cannot be empty");
  await db.reviewStandard.update({ where: { id }, data: { prompt } });
  revalidatePath("/admin");
}
