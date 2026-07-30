import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManageDeals } from "@/lib/types";
import { aiConfigured } from "@/lib/ai";
import { createDeal } from "@/app/actions/deals";
import { createDealFromDeck } from "@/app/actions/profile";
import DealForm from "@/components/DealForm";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ aiError?: string }>;
}) {
  const user = await requireUser();
  if (!canManageDeals(user)) redirect("/board");
  const { aiError } = await searchParams;

  const [assetClasses, users] = await Promise.all([
    db.assetClass.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-stone-900">New deal</h1>
      <p className="mb-6 text-[13px] text-stone-500">
        Creates a card in the Pipeline column.
      </p>

      {aiConfigured() && (
        <div className="mb-6 rounded-xl border border-accent-200 bg-accent-50/50 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-accent-900">✨ Start from a pitch deck</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
            Upload the manager&apos;s deck and the card is created for you — manager, fund,
            strategy, size — along with a full profile: key people, terms, deadlines, and the
            track record charted. The deck is attached to the deal, and everything stays
            editable.
          </p>
          {aiError && (
            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
              {aiError}
            </p>
          )}
          <form action={createDealFromDeck} className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="file"
              required
              accept=".pdf,.docx,.pptx,.ppt,.doc,.txt,.md"
              className="min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] text-stone-500 shadow-sm file:mr-2 file:rounded file:border-0 file:bg-accent-100 file:px-2 file:py-1 file:text-[12px] file:font-medium file:text-accent-800"
            />
            <button className="rounded-md bg-accent-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-800">
              Extract &amp; create deal
            </button>
          </form>
          <p className="mt-2 text-[11px] text-stone-400">
            Takes about a minute. You&apos;ll land on the new deal when it&apos;s done.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <DealForm action={createDeal} assetClasses={assetClasses} users={users} />
      </div>
    </div>
  );
}
