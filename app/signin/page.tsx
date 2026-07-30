import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, activeSessionUserIds } from "@/lib/session";
import { signIn } from "@/app/actions/auth";
import { ROLE_LABELS, type Role } from "@/lib/types";
import { initials } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ taken?: string }>;
}) {
  const current = await getCurrentUser();
  if (current) redirect("/board");
  const { taken } = await searchParams;

  const [users, signedIn] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      include: { roles: true },
      orderBy: { name: "asc" },
    }),
    activeSessionUserIds(),
  ]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-16">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent-700 font-mono text-xl font-bold text-white">
        A
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-stone-900">
        Investment Process
      </h1>
      <p className="mt-1 text-sm text-stone-500">Select your name to continue</p>

      {taken && (
        <p className="mt-4 w-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-[13px] text-amber-800">
          That user is already signed in elsewhere. Their seat frees when they sign out or
          after 30 minutes idle.
        </p>
      )}

      <div className="mt-8 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {users.length === 0 && (
          <p className="p-6 text-center text-sm text-stone-500">
            No users yet — run <code className="font-mono">npm run db:seed</code>.
          </p>
        )}
        {users.map((u) => {
          const busy = signedIn.has(u.id);
          return (
            <form key={u.id} action={signIn}>
              <input type="hidden" name="userId" value={u.id} />
              <button
                type="submit"
                disabled={busy}
                title={
                  busy
                    ? "Signed in elsewhere — the seat frees when they sign out or after 30 minutes idle"
                    : undefined
                }
                className={`flex w-full items-center gap-3 border-b border-stone-100 px-4 py-3 text-left last:border-b-0 ${
                  busy ? "cursor-not-allowed opacity-45" : "hover:bg-accent-50"
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    busy ? "bg-stone-100 text-stone-400" : "bg-accent-100 text-accent-800"
                  }`}
                >
                  {initials(u.name)}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-stone-900">{u.name}</span>
                  <span className="block text-xs text-stone-500">
                    {u.roles.map((r) => ROLE_LABELS[r.role as Role] ?? r.role).join(" · ")}
                  </span>
                </span>
                {busy ? (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                    Signed in
                  </span>
                ) : (
                  <span className="text-stone-300">→</span>
                )}
              </button>
            </form>
          );
        })}
      </div>

      <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-stone-400">
        Trusted-network sign-in for v1: every action and approval is attributed to the selected
        user in the audit trail. One sign-in per user at a time.
      </p>
    </div>
  );
}
