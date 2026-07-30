import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";

const SESSION_COOKIE = "ipk_uid";

/**
 * One seat per user (pre-auth): the cookie holds a random session token backed
 * by a Session row whose userId is unique. A seat frees when its holder signs
 * out, an admin forces it, or the session sits idle past this window.
 */
export const SESSION_IDLE_MS = 30 * 60_000;

function staleCutoff(): Date {
  return new Date(Date.now() - SESSION_IDLE_MS);
}

/** Create (or take over) the user's single session and set the cookie. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.session.upsert({
    where: { userId },
    update: { token, createdAt: new Date(), lastSeenAt: new Date() },
    create: { token, userId },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Delete this browser's session row (freeing the seat) and the cookie. */
export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Does this user have a live (non-stale) session right now? */
export async function hasFreshSession(userId: string): Promise<boolean> {
  const s = await db.session.findUnique({ where: { userId } });
  return !!s && s.lastSeenAt > staleCutoff();
}

/** Ids of all users currently holding a live seat — for the sign-in roster. */
export async function activeSessionUserIds(): Promise<Set<string>> {
  const rows = await db.session.findMany({
    where: { lastSeenAt: { gt: staleCutoff() } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

/** Returns the signed-in user with roles, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token },
    include: { user: { include: { roles: true } } },
  });
  if (!session || !session.user.active) return null;
  if (session.lastSeenAt <= staleCutoff()) return null; // idle too long — seat freed
  // Keep the seat fresh, throttled to one write a minute.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await db.session.update({
      where: { token },
      data: { lastSeenAt: new Date() },
    });
  }
  return session.user;
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** For pages: redirect to sign-in when not authenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}

/** For server actions: throw when not authenticated (no redirect side effects). */
export async function requireUserAction(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user;
}
