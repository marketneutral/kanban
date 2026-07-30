"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Option = { value: string; label: string };

export default function FilterBar({
  assetClasses,
  leads,
}: {
  assetClasses: Option[];
  leads: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  const selectCls =
    "rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] text-stone-700 shadow-sm focus:border-accent-400 focus:outline-none";

  const hasFilters = !!(
    params.get("assetClass") ||
    params.get("lead") ||
    params.get("show") ||
    params.get("q")
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        aria-label="Search deals"
        placeholder="Search manager, fund…"
        defaultValue={params.get("q") ?? ""}
        // re-mount when the URL's q changes externally (e.g. Clear)
        key={params.get("q") ?? ""}
        onKeyDown={(e) => {
          if (e.key === "Enter") setParam("q", e.currentTarget.value.trim());
        }}
        onBlur={(e) => {
          if (e.currentTarget.value.trim() !== (params.get("q") ?? "")) {
            setParam("q", e.currentTarget.value.trim());
          }
        }}
        className={`${selectCls} w-44 placeholder:text-stone-400`}
      />
      <select
        aria-label="Filter by asset class"
        className={selectCls}
        value={params.get("assetClass") ?? ""}
        onChange={(e) => setParam("assetClass", e.target.value)}
      >
        <option value="">All asset classes</option>
        {assetClasses.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by deal lead"
        className={selectCls}
        value={params.get("lead") ?? ""}
        onChange={(e) => setParam("lead", e.target.value)}
      >
        <option value="">All leads</option>
        {leads.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Show deals"
        className={selectCls}
        value={params.get("show") ?? ""}
        onChange={(e) => setParam("show", e.target.value)}
      >
        <option value="">In progress</option>
        <option value="funded">Closed &amp; funded</option>
        <option value="all">Everything</option>
      </select>
      {hasFilters && (
        <button
          onClick={() => router.replace(pathname)}
          className="rounded-md px-2 py-1.5 text-[13px] text-stone-500 hover:text-stone-800"
        >
          Clear
        </button>
      )}
    </div>
  );
}
