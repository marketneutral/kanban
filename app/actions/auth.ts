"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { setSessionUser, clearSession } from "@/lib/session";

export async function signIn(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) redirect("/signin");
  await setSessionUser(user.id);
  redirect("/board");
}

export async function signOut() {
  await clearSession();
  redirect("/signin");
}
