"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, clearSession, hasFreshSession } from "@/lib/session";

export async function signIn(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) redirect("/signin");
  // One seat per user: a live session elsewhere blocks this sign-in. (The
  // roster grays taken seats, but two tabs can race — this is the backstop.)
  if (await hasFreshSession(user.id)) redirect("/signin?taken=1");
  await createSession(user.id);
  redirect("/board");
}

export async function signOut() {
  await clearSession();
  redirect("/signin");
}
