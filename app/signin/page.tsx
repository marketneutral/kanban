import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { signIn } from "@/app/actions/auth";
import { ROLE_LABELS, type Role } from "@/lib/types";
import { initials } from "@/lib/format";

export default async function SignInPage() {
  const current = await getCurrentUser();
  if (current) redirect("/board");

  const users = await db.user.findMany({
    where: { active: true },
    include: { roles: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-5 py-16">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent-700 font-mono text-xl font-bold text-white">
        A
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight text-stone-900">
        Investment Process
      </h1>
      <p className="mt-1 text-sm text-stone-500">Select your name to continue</p>

      <div className="mt-8 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {users.length === 0 && (
          <p className="p-6 text-center text-sm text-stone-500">
            No users yet — run <code className="font-mono">npm run db:seed</code>.
          </p>
        )}
        {users.map((u) => (
          <form key={u.id} action={signIn}>
            <input type="hidden" name="userId" value={u.id} />
            <button
              type="submit"
              className="flex w-full items-center gap-3 border-b border-stone-100 px-4 py-3 text-left last:border-b-0 hover:bg-accent-50"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-100 text-xs font-semibold text-accent-800">
                {initials(u.name)}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-stone-900">{u.name}</span>
                <span className="block text-xs text-stone-500">
                  {u.roles.map((r) => ROLE_LABELS[r.role as Role] ?? r.role).join(" · ")}
                </span>
              </span>
              <span className="text-stone-300">→</span>
            </button>
          </form>
        ))}
      </div>

      <p className="mt-6 max-w-sm text-center text-xs leading-relaxed text-stone-400">
        Trusted-network sign-in for v1: every action and approval is attributed to the selected
        user in the audit trail.
      </p>
    </div>
  );
}
