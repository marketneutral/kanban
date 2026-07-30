type Option = { id: string; name: string };

const inputCls =
  "w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-accent-400 focus:outline-none";
const labelCls = "mb-1 block text-[13px] font-medium text-stone-600";

export default function DealForm({
  action,
  assetClasses,
  users,
  deal,
}: {
  action: (formData: FormData) => Promise<void>;
  assetClasses: Option[];
  users: Option[];
  deal?: {
    id: string;
    managerName: string;
    fundName: string;
    strategy: string | null;
    targetSizeMm: number | null;
    assetClassId: string;
    leadId: string;
    source: string | null;
    notes: string | null;
    team: { userId: string }[];
  };
}) {
  const teamIds = new Set(deal?.team.map((t) => t.userId));

  return (
    <form action={action} className="grid gap-4">
      {deal && <input type="hidden" name="dealId" value={deal.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="managerName">Manager *</label>
          <input id="managerName" name="managerName" required defaultValue={deal?.managerName}
            className={inputCls} placeholder="e.g. Blackwood Capital" />
        </div>
        <div>
          <label className={labelCls} htmlFor="fundName">Fund *</label>
          <input id="fundName" name="fundName" required defaultValue={deal?.fundName}
            className={inputCls} placeholder="e.g. Credit Opportunities III" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="assetClassId">Asset class *</label>
          <select id="assetClassId" name="assetClassId" required defaultValue={deal?.assetClassId ?? ""}
            className={inputCls}>
            <option value="" disabled>Select…</option>
            {assetClasses.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="targetSizeMm">Target size ($mm)</label>
          <input id="targetSizeMm" name="targetSizeMm" type="number" min="0" step="any"
            defaultValue={deal?.targetSizeMm ?? ""} className={inputCls} placeholder="50" />
        </div>
        <div>
          <label className={labelCls} htmlFor="leadId">Deal lead *</label>
          <select id="leadId" name="leadId" required defaultValue={deal?.leadId ?? ""} className={inputCls}>
            <option value="" disabled>Select…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="strategy">Strategy</label>
          <input id="strategy" name="strategy" defaultValue={deal?.strategy ?? ""}
            className={inputCls} placeholder="e.g. Distressed / special situations" />
        </div>
        <div>
          <label className={labelCls} htmlFor="source">Source / referral</label>
          <input id="source" name="source" defaultValue={deal?.source ?? ""}
            className={inputCls} placeholder="e.g. Cap intro, conference, LP network" />
        </div>
      </div>

      <fieldset>
        <legend className={labelCls}>Deal team</legend>
        <div className="flex flex-wrap gap-2">
          {users.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] text-stone-700 shadow-sm has-checked:border-accent-400 has-checked:bg-accent-50"
            >
              <input
                type="checkbox"
                name="teamIds"
                value={u.id}
                defaultChecked={teamIds.has(u.id)}
                className="accent-[#235a92]"
              />
              {u.name}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-stone-400">The deal lead is always on the team.</p>
      </fieldset>

      <div>
        <label className={labelCls} htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={deal?.notes ?? ""}
          className={inputCls} placeholder="Context, thesis, open questions…" />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-accent-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-800"
        >
          {deal ? "Save changes" : "Create deal"}
        </button>
      </div>
    </form>
  );
}
