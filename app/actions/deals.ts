"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserAction } from "@/lib/session";
import { canManageDeals, stageIndex, STAGES, STAGE_LABELS, type Stage } from "@/lib/types";

async function requireDealManager() {
  const user = await requireUserAction();
  if (!canManageDeals(user)) throw new Error("Not permitted");
  return user;
}

function dealFields(formData: FormData) {
  const managerName = String(formData.get("managerName") ?? "").trim();
  const fundName = String(formData.get("fundName") ?? "").trim();
  const assetClassId = String(formData.get("assetClassId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  if (!managerName || !fundName || !assetClassId || !leadId) {
    throw new Error("Manager, fund, asset class and lead are required");
  }
  const sizeRaw = String(formData.get("targetSizeMm") ?? "").trim();
  const targetSizeMm = sizeRaw ? Number(sizeRaw) : null;
  if (targetSizeMm !== null && (!Number.isFinite(targetSizeMm) || targetSizeMm < 0)) {
    throw new Error("Target size must be a non-negative number");
  }
  return {
    managerName,
    fundName,
    assetClassId,
    leadId,
    targetSizeMm,
    strategy: String(formData.get("strategy") ?? "").trim() || null,
    source: String(formData.get("source") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

function teamIds(formData: FormData): string[] {
  return formData.getAll("teamIds").map(String).filter(Boolean);
}

export async function createDeal(formData: FormData) {
  const user = await requireDealManager();
  const fields = dealFields(formData);
  const deal = await db.deal.create({
    data: {
      ...fields,
      team: {
        create: teamIds(formData)
          .filter((id) => id !== fields.leadId)
          .map((userId) => ({ userId })),
      },
      events: { create: { actorId: user.id, action: "DEAL_CREATED" } },
    },
  });
  revalidatePath("/board");
  redirect(`/deals/${deal.id}`);
}

export async function updateDeal(formData: FormData) {
  const user = await requireDealManager();
  const dealId = String(formData.get("dealId") ?? "");
  const fields = dealFields(formData);
  await db.$transaction([
    db.dealTeamMember.deleteMany({ where: { dealId } }),
    db.deal.update({
      where: { id: dealId },
      data: {
        ...fields,
        team: {
          create: teamIds(formData)
            .filter((id) => id !== fields.leadId)
            .map((userId) => ({ userId })),
        },
        events: { create: { actorId: user.id, action: "DEAL_UPDATED" } },
      },
    }),
  ]);
  revalidatePath("/board");
  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}

/**
 * M1: simple forward/back movement restricted to deal managers, fully audited.
 * M2 replaces the interior of this action with hard gate checks (documents,
 * presentation records, open follow-ups) via lib/workflow.ts.
 */
export async function moveStage(formData: FormData) {
  const user = await requireDealManager();
  const dealId = String(formData.get("dealId") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId } });
  if (deal.status !== "ACTIVE") throw new Error("Deal is not active");

  const idx = stageIndex(deal.stage);
  const nextIdx = direction === "back" ? idx - 1 : idx + 1;
  if (nextIdx < 0 || nextIdx >= STAGES.length) throw new Error("No stage in that direction");
  // APPROVED is only reachable via the approval chain (M4), never by manual move.
  if (STAGES[nextIdx] === "APPROVED") throw new Error("Approval is granted via the approval chain");
  const nextStage = STAGES[nextIdx] as Stage;

  await db.deal.update({
    where: { id: dealId },
    data: {
      stage: nextStage,
      stageEnteredAt: new Date(),
      events: {
        create: {
          actorId: user.id,
          action: direction === "back" ? "STAGE_SENT_BACK" : "STAGE_ADVANCED",
          detail: JSON.stringify({
            from: STAGE_LABELS[deal.stage as Stage],
            to: STAGE_LABELS[nextStage],
          }),
        },
      },
    },
  });
  revalidatePath("/board");
  revalidatePath(`/deals/${dealId}`);
}

export async function setDealStatus(formData: FormData) {
  const user = await requireDealManager();
  const dealId = String(formData.get("dealId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["ACTIVE", "ON_HOLD", "PASSED"].includes(status)) throw new Error("Invalid status");
  const reason = String(formData.get("reason") ?? "").trim();
  if (status === "PASSED" && !reason) throw new Error("A reason is required to pass on a deal");

  await db.deal.update({
    where: { id: dealId },
    data: {
      status,
      passedReason: status === "PASSED" ? reason : null,
      events: {
        create: {
          actorId: user.id,
          action: `STATUS_${status}`,
          detail: reason ? JSON.stringify({ reason }) : null,
        },
      },
    },
  });
  revalidatePath("/board");
  revalidatePath(`/deals/${dealId}`);
}
