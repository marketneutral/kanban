"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserAction } from "@/lib/session";
import { canManageDeals, hasRole, isAdmin } from "@/lib/types";
import { isMonday, todayUtc } from "@/lib/meetings";

function touch(dealId: string) {
  revalidatePath("/board");
  revalidatePath(`/deals/${dealId}`);
}

// ---------------------------------------------------------------- follow-ups

export async function addFollowUp(formData: FormData) {
  const user = await requireUserAction();
  const dealId = String(formData.get("dealId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Follow-up text is required");
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;

  const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId } });
  await db.followUp.create({
    data: {
      dealId,
      stage: deal.stage,
      title,
      assigneeId,
      createdById: user.id,
    },
  });
  await db.stageEvent.create({
    data: { dealId, actorId: user.id, action: "FOLLOWUP_ADDED", detail: JSON.stringify({ title }) },
  });
  touch(dealId);
}

export async function resolveFollowUp(formData: FormData) {
  const user = await requireUserAction();
  const id = String(formData.get("id") ?? "");
  const fu = await db.followUp.update({
    where: { id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  await db.stageEvent.create({
    data: {
      dealId: fu.dealId,
      actorId: user.id,
      action: "FOLLOWUP_RESOLVED",
      detail: JSON.stringify({ title: fu.title }),
    },
  });
  touch(fu.dealId);
}

export async function waiveFollowUp(formData: FormData) {
  const user = await requireUserAction();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) throw new Error("A note is required to waive a follow-up");

  const fu = await db.followUp.findUniqueOrThrow({ where: { id }, include: { deal: true } });
  if (fu.deal.leadId !== user.id && !isAdmin(user)) {
    throw new Error("Only the deal lead can waive a follow-up");
  }
  await db.followUp.update({
    where: { id },
    data: { status: "WAIVED", waiveNote: note, resolvedAt: new Date() },
  });
  await db.stageEvent.create({
    data: {
      dealId: fu.dealId,
      actorId: user.id,
      action: "FOLLOWUP_WAIVED",
      detail: JSON.stringify({ title: fu.title, note }),
    },
  });
  touch(fu.dealId);
}

export async function reopenFollowUp(formData: FormData) {
  const user = await requireUserAction();
  const id = String(formData.get("id") ?? "");
  const fu = await db.followUp.findUniqueOrThrow({ where: { id }, include: { deal: true } });
  if (fu.deal.leadId !== user.id && !isAdmin(user) && !canManageDeals(user)) {
    throw new Error("Not permitted");
  }
  await db.followUp.update({
    where: { id },
    data: { status: "OPEN", waiveNote: null, resolvedAt: null },
  });
  await db.stageEvent.create({
    data: {
      dealId: fu.dealId,
      actorId: user.id,
      action: "FOLLOWUP_REOPENED",
      detail: JSON.stringify({ title: fu.title }),
    },
  });
  touch(fu.dealId);
}

// ------------------------------------------------------------- presentations

export async function recordPresentation(formData: FormData) {
  const user = await requireUserAction();
  if (!canManageDeals(user)) throw new Error("Not permitted");
  const dealId = String(formData.get("dealId") ?? "");
  const presentedAtRaw = String(formData.get("presentedAt") ?? "");
  const presentedAt = presentedAtRaw ? new Date(presentedAtRaw) : new Date();
  if (Number.isNaN(presentedAt.getTime())) throw new Error("Invalid date");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const deal = await db.deal.findUniqueOrThrow({ where: { id: dealId } });
  await db.presentationRecord.create({
    data: { dealId, stage: deal.stage, presentedAt, notes },
  });
  // presenting clears the deal from the upcoming IC agenda
  await db.deal.update({ where: { id: dealId }, data: { scheduledFor: null } });
  await db.stageEvent.create({
    data: {
      dealId,
      actorId: user.id,
      action: "PRESENTED",
      detail: JSON.stringify({ stage: deal.stage, presentedAt: presentedAt.toISOString() }),
    },
  });
  touch(dealId);
}

// ------------------------------------------------------------- IC meetings

export async function scheduleForIC(formData: FormData) {
  const user = await requireUserAction();
  if (!canManageDeals(user)) throw new Error("Not permitted");
  const dealId = String(formData.get("dealId") ?? "");
  const dateRaw = String(formData.get("meetingDate") ?? "");
  const date = new Date(`${dateRaw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || !isMonday(date)) {
    throw new Error("IC meetings are on Mondays");
  }
  if (date < todayUtc()) throw new Error("That Monday has passed");

  await db.deal.update({
    where: { id: dealId },
    data: {
      scheduledFor: date,
      events: {
        create: {
          actorId: user.id,
          action: "IC_SCHEDULED",
          detail: JSON.stringify({ date: dateRaw }),
        },
      },
    },
  });
  revalidatePath("/meetings");
  touch(dealId);
}

export async function unscheduleFromIC(formData: FormData) {
  const user = await requireUserAction();
  if (!canManageDeals(user)) throw new Error("Not permitted");
  const dealId = String(formData.get("dealId") ?? "");
  await db.deal.update({
    where: { id: dealId },
    data: {
      scheduledFor: null,
      events: { create: { actorId: user.id, action: "IC_UNSCHEDULED" } },
    },
  });
  revalidatePath("/meetings");
  touch(dealId);
}

// ------------------------------------------------- ODD / Legal checklists

export async function toggleChecklistItem(formData: FormData) {
  const user = await requireUserAction();
  const id = String(formData.get("id") ?? "");
  const item = await db.checklistItem.findUniqueOrThrow({ where: { id } });

  const allowed =
    isAdmin(user) ||
    (item.track === "ODD" && hasRole(user, "OPS")) ||
    (item.track === "LEGAL" && hasRole(user, "LEGAL"));
  if (!allowed) throw new Error(`Only ${item.track === "ODD" ? "Ops" : "Legal"} can update this checklist`);

  // Un-checking an ODD item voids a prior Ops sign-off.
  const nowDone = !item.done;
  await db.checklistItem.update({
    where: { id },
    data: {
      done: nowDone,
      doneById: nowDone ? user.id : null,
      doneAt: nowDone ? new Date() : null,
    },
  });
  if (!nowDone && item.track === "ODD") {
    await db.deal.update({
      where: { id: item.dealId },
      data: { oddCompletedAt: null, oddCompletedById: null },
    });
  }
  touch(item.dealId);
}

export async function markOddComplete(formData: FormData) {
  const user = await requireUserAction();
  if (!hasRole(user, "OPS") && !isAdmin(user)) throw new Error("Only Ops can sign off ODD");
  const dealId = String(formData.get("dealId") ?? "");

  const items = await db.checklistItem.findMany({ where: { dealId, track: "ODD" } });
  if (items.length === 0 || items.some((i) => !i.done)) {
    throw new Error("The ODD checklist must be complete first");
  }
  await db.deal.update({
    where: { id: dealId },
    data: { oddCompletedAt: new Date(), oddCompletedById: user.id },
  });
  await db.stageEvent.create({
    data: { dealId, actorId: user.id, action: "ODD_COMPLETED" },
  });
  touch(dealId);
}
