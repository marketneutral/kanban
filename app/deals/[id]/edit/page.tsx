import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManageDeals } from "@/lib/types";
import { updateDeal } from "@/app/actions/deals";
import DealForm from "@/components/DealForm";

export default async function EditDealPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!canManageDeals(user)) redirect("/board");
  const { id } = await params;

  const [deal, assetClasses, users] = await Promise.all([
    db.deal.findUnique({ where: { id }, include: { team: true } }),
    db.assetClass.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!deal) notFound();

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-stone-900">
        Edit — {deal.managerName}
      </h1>
      <p className="mb-6 text-[13px] text-stone-500">{deal.fundName}</p>
      <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <DealForm action={updateDeal} assetClasses={assetClasses} users={users} deal={deal} />
      </div>
    </div>
  );
}
