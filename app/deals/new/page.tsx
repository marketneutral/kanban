import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManageDeals } from "@/lib/types";
import { createDeal } from "@/app/actions/deals";
import DealForm from "@/components/DealForm";

export default async function NewDealPage() {
  const user = await requireUser();
  if (!canManageDeals(user)) redirect("/board");

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
      <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <DealForm action={createDeal} assetClasses={assetClasses} users={users} />
      </div>
    </div>
  );
}
