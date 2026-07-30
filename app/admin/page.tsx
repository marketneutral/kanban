import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isAdmin, ROLES, ROLE_LABELS, type Role } from "@/lib/types";
import {
  createUser,
  toggleUserActive,
  toggleUserRole,
  forceSignOut,
  createAssetClass,
  deleteAssetClass,
  toggleAssetClassMarket,
} from "@/app/actions/admin";
import { activeSessionUserIds } from "@/lib/session";
import { updateReviewStandard } from "@/app/actions/ai";
import { aiConfigured, AI_MODEL } from "@/lib/ai";

export const dynamic = "force-dynamic";

const inputCls =
  "rounded-md border border-stone-200 bg-white px-3 py-1.5 text-[13px] shadow-sm placeholder:text-stone-400 focus:border-accent-400 focus:outline-none";

export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/board");

  const [users, assetClasses, standards, signedIn] = await Promise.all([
    db.user.findMany({
      include: { roles: true, _count: { select: { ledDeals: true } } },
      orderBy: { name: "asc" },
    }),
    db.assetClass.findMany({
      include: { _count: { select: { deals: true } } },
      orderBy: { name: "asc" },
    }),
    db.reviewStandard.findMany({ orderBy: [{ mode: "asc" }, { kind: "asc" }] }),
    activeSessionUserIds(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-stone-900">Admin</h1>
      <p className="text-[13px] text-stone-500">Users, roles and asset classes.</p>

      {/* Users */}
      <section className="mt-6 rounded-xl border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-900">Users</h2>
          <p className="text-xs text-stone-500">
            Click a role chip to grant or remove it. Deactivated users cannot sign in but keep
            their history.
          </p>
        </header>
        <div className="divide-y divide-stone-100">
          {users.map((u) => {
            const has = new Set(u.roles.map((r) => r.role));
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-[180px]">
                  <div className={`flex items-center gap-1.5 text-sm font-medium ${u.active ? "text-stone-900" : "text-stone-400 line-through"}`}>
                    {u.name}
                    {signedIn.has(u.id) && (
                      <span
                        title="Currently signed in"
                        className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                      />
                    )}
                  </div>
                  <div className="text-xs text-stone-400">{u.email}</div>
                </div>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {ROLES.map((role) => {
                    const on = has.has(role);
                    return (
                      <form key={role} action={toggleUserRole}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="role" value={role} />
                        <button
                          type="submit"
                          title={on ? `Remove ${ROLE_LABELS[role]}` : `Grant ${ROLE_LABELS[role]}`}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                            on
                              ? "bg-accent-700 text-white"
                              : "bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600"
                          }`}
                        >
                          {ROLE_LABELS[role]}
                        </button>
                      </form>
                    );
                  })}
                </div>
                {signedIn.has(u.id) && u.id !== user.id && (
                  <form action={forceSignOut}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button
                      type="submit"
                      title="Free this user's seat — their browser will be signed out"
                      className="rounded-md px-2.5 py-1 text-[12px] text-amber-700 hover:bg-amber-50"
                    >
                      Force sign-out
                    </button>
                  </form>
                )}
                <form action={toggleUserActive}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button
                    type="submit"
                    disabled={u.id === user.id}
                    className="rounded-md px-2.5 py-1 text-[12px] text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                  >
                    {u.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
        <form action={createUser} className="flex flex-wrap items-center gap-2 border-t border-stone-100 bg-stone-50 px-5 py-3">
          <input name="name" required placeholder="Full name" className={inputCls} />
          <input name="email" required type="email" placeholder="Email" className={inputCls} />
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((role) => (
              <label
                key={role}
                className="flex cursor-pointer items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-500 has-checked:bg-accent-700 has-checked:text-white"
              >
                <input type="checkbox" name="roles" value={role} className="sr-only" />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
          <button className="rounded-md bg-accent-700 px-3 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-accent-800">
            Add user
          </button>
        </form>
      </section>

      {/* Asset classes */}
      <section className="mt-6 rounded-xl border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-900">Asset classes</h2>
          <p className="text-xs text-stone-500">
            Used on deal cards and in reports. Public classes route to the MD — Publics for
            approval, Private to the MD — Privates; click the tag to switch. Classes in use by
            deals cannot be removed.
          </p>
        </header>
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {assetClasses.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[13px] text-stone-700 shadow-sm"
            >
              {a.name}
              <form action={toggleAssetClassMarket}>
                <input type="hidden" name="id" value={a.id} />
                <button
                  type="submit"
                  title={`Switch to ${a.marketType === "PUBLIC" ? "Private" : "Public"} — routes the MD approval`}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                    a.marketType === "PRIVATE"
                      ? "bg-stone-700 text-white hover:bg-stone-600"
                      : "bg-accent-100 text-accent-800 hover:bg-accent-200"
                  }`}
                >
                  {a.marketType === "PRIVATE" ? "Private" : "Public"}
                </button>
              </form>
              <span className="text-[11px] text-stone-400">{a._count.deals}</span>
              {a._count.deals === 0 && (
                <form action={deleteAssetClass}>
                  <input type="hidden" name="id" value={a.id} />
                  <button
                    type="submit"
                    title="Remove asset class"
                    className="text-stone-300 hover:text-red-500"
                  >
                    ×
                  </button>
                </form>
              )}
            </span>
          ))}
        </div>
        <form action={createAssetClass} className="flex items-center gap-2 border-t border-stone-100 bg-stone-50 px-5 py-3">
          <input name="name" required placeholder="New asset class" className={inputCls} />
          <button className="rounded-md bg-accent-700 px-3 py-1.5 text-[13px] font-medium text-white shadow-sm hover:bg-accent-800">
            Add
          </button>
        </form>
      </section>

      {/* AI review standards */}
      <section className="mt-6 rounded-xl border border-stone-200 bg-white shadow-sm">
        <header className="border-b border-stone-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-stone-900">✨ AI review standards</h2>
          <p className="text-xs text-stone-500">
            The standards each AI document review runs against.{" "}
            {aiConfigured() ? (
              <>
                AI is <span className="font-medium text-emerald-600">enabled</span> via Azure
                OpenAI (deployment: {AI_MODEL}).
              </>
            ) : (
              <>
                AI is <span className="font-medium text-amber-600">not configured</span> — set{" "}
                <code className="font-mono">AZURE_OPENAI_ENDPOINT</code>,{" "}
                <code className="font-mono">AZURE_OPENAI_API_KEY</code> and{" "}
                <code className="font-mono">AZURE_OPENAI_DEPLOYMENT</code> to enable reviews.
              </>
            )}
          </p>
        </header>
        <div className="divide-y divide-stone-100">
          {standards.map((s) => (
            <form key={s.id} action={updateReviewStandard} className="px-5 py-4">
              <input type="hidden" name="id" value={s.id} />
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-stone-800">
                  {s.mode === "DEVILS_ADVOCATE" ? "😈 " : ""}
                  {s.title}{" "}
                  <span className="font-mono text-[11px] font-normal text-stone-400">
                    ({s.kind})
                  </span>
                </h3>
                <button className="rounded-md bg-accent-700 px-3 py-1 text-[12px] font-medium text-white shadow-sm hover:bg-accent-800">
                  Save
                </button>
              </div>
              <textarea
                name="prompt"
                rows={8}
                defaultValue={s.prompt}
                className="mt-2 w-full rounded-md border border-stone-200 bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-stone-700 shadow-sm focus:border-accent-400 focus:outline-none"
              />
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
