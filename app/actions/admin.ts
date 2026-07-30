"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserAction } from "@/lib/session";
import { isAdmin, ROLES, type Role } from "@/lib/types";
import { guard } from "@/lib/action-guard";

async function requireAdmin() {
  const user = await requireUserAction();
  if (!isAdmin(user)) throw new Error("Admin only");
  return user;
}

export const createUser = guard(createUserBody);
async function createUserBody(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roles = formData.getAll("roles").map(String).filter((r) => ROLES.includes(r as Role));
  if (!name || !email) throw new Error("Name and email are required");
  if (roles.length === 0) throw new Error("Pick at least one role");
  await db.user.create({
    data: { name, email, roles: { create: roles.map((role) => ({ role })) } },
  });
  revalidatePath("/admin");
}

export const toggleUserActive = guard(toggleUserActiveBody);
async function toggleUserActiveBody(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (userId === admin.id) throw new Error("You cannot deactivate yourself");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { active: !user.active } });
  revalidatePath("/admin");
}

export const toggleUserRole = guard(toggleUserRoleBody);
async function toggleUserRoleBody(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!ROLES.includes(role as Role)) throw new Error("Unknown role");

  const existing = await db.userRole.findUnique({
    where: { userId_role: { userId, role } },
  });
  if (existing) {
    if (userId === admin.id && role === "ADMIN") {
      throw new Error("You cannot remove your own admin role");
    }
    await db.userRole.delete({ where: { id: existing.id } });
  } else {
    await db.userRole.create({ data: { userId, role } });
  }
  revalidatePath("/admin");
}

/** Free a user's seat (e.g. their browser crashed and the session is locked). */
export const forceSignOut = guard(forceSignOutBody);
async function forceSignOutBody(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  await db.session.deleteMany({ where: { userId } });
  revalidatePath("/admin");
  revalidatePath("/signin");
}

export const createAssetClass = guard(createAssetClassBody);
async function createAssetClassBody(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");
  await db.assetClass.create({ data: { name } });
  revalidatePath("/admin");
}

export const toggleAssetClassMarket = guard(toggleAssetClassMarketBody);
async function toggleAssetClassMarketBody(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const ac = await db.assetClass.findUniqueOrThrow({ where: { id } });
  await db.assetClass.update({
    where: { id },
    data: { marketType: ac.marketType === "PUBLIC" ? "PRIVATE" : "PUBLIC" },
  });
  revalidatePath("/admin");
  revalidatePath("/reports");
}

export const deleteAssetClass = guard(deleteAssetClassBody);
async function deleteAssetClassBody(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const inUse = await db.deal.count({ where: { assetClassId: id } });
  if (inUse > 0) throw new Error("Asset class is in use by deals");
  await db.assetClass.delete({ where: { id } });
  revalidatePath("/admin");
}
