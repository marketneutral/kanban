"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserAction } from "@/lib/session";
import { hasRole, ROLE_LABELS, APPROVAL_STEPS, type ApprovalStep } from "@/lib/types";
import { evaluateChain, gateInclude, mdRoleFor, resetApprovals } from "@/lib/workflow";

// Each chain step requires the signature of a specific role (the MD step routes
// by the deal's market type). Admins deliberately cannot approve — sign-off
// authority is the product.
export async function decideApproval(formData: FormData) {
  const user = await requireUserAction();
  const dealId = String(formData.get("dealId") ?? "");
  const step = String(formData.get("step") ?? "") as ApprovalStep;
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!APPROVAL_STEPS.includes(step)) throw new Error("Unknown approval step");
  if (decision !== "approve" && decision !== "reject") throw new Error("Unknown decision");
  if (decision === "reject" && !note) throw new Error("A note is required to reject");

  const deal = await db.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: { ...gateInclude, approvals: true, assetClass: true },
  });
  if (deal.stage !== "APPROVALS" || deal.status !== "ACTIVE") {
    throw new Error("Deal is not in the approval chain");
  }

  const chain = evaluateChain(deal, deal.approvals, mdRoleFor(deal.assetClass.marketType));
  const chainStep = chain.find((c) => c.step === step)!;
  if (!hasRole(user, chainStep.requiredRole)) {
    throw new Error(`Only a ${ROLE_LABELS[chainStep.requiredRole]} can decide this step`);
  }
  if (!chainStep.available) {
    throw new Error(chainStep.blockedReason ?? "This step is not actionable yet");
  }

  if (decision === "approve") {
    await db.approval.update({
      where: { dealId_step: { dealId, step } },
      data: {
        status: "APPROVED",
        decidedById: user.id,
        decidedAt: new Date(),
        note: note || null,
      },
    });
    await db.stageEvent.create({
      data: {
        dealId,
        actorId: user.id,
        action: "APPROVAL_GRANTED",
        detail: JSON.stringify({ step, ...(note ? { note } : {}) }),
      },
    });

    if (step === "CEO") {
      // Final signature: the deal is approved.
      await db.deal.update({
        where: { id: dealId },
        data: {
          stage: "APPROVED",
          status: "APPROVED",
          stageEnteredAt: new Date(),
          events: { create: { actorId: user.id, action: "DEAL_APPROVED" } },
        },
      });
    }
  } else {
    // Rejection: back to Investment Proposal, all approvals voided, and the
    // rejection note becomes an open follow-up for the deal team.
    await resetApprovals(dealId);
    await db.deal.update({
      where: { id: dealId },
      data: {
        stage: "PROPOSAL",
        stageEnteredAt: new Date(),
        events: {
          create: {
            actorId: user.id,
            action: "APPROVAL_REJECTED",
            detail: JSON.stringify({ step, note }),
          },
        },
        followUps: {
          create: {
            stage: "PROPOSAL",
            title: `Address ${step} rejection: ${note}`,
            createdById: user.id,
            assigneeId: deal.leadId,
          },
        },
      },
    });
  }

  revalidatePath("/board");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/reports");
}
