"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserAction } from "@/lib/session";
import { isAdmin, ROLES, type Role } from "@/lib/types";

async function requireAdmin() {
  const user = await requireUserAction();
  if (!isAdmin(user)) throw new Error("Admin only");
  return user;
}

export async function createUser(formData: FormData) {
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

export async function toggleUserActive(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (userId === admin.id) throw new Error("You cannot deactivate yourself");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { active: !user.active } });
  revalidatePath("/admin");
}

export async function toggleUserRole(formData: FormData) {
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

export async function createAssetClass(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");
  await db.assetClass.create({ data: { name } });
  revalidatePath("/admin");
}

export async function deleteAssetClass(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const inUse = await db.deal.count({ where: { assetClassId: id } });
  if (inUse > 0) throw new Error("Asset class is in use by deals");
  await db.assetClass.delete({ where: { id } });
  revalidatePath("/admin");
}
