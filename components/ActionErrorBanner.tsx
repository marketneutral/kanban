"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Shows the `?error=` message a failed server action redirected back with. */
export default function ActionErrorBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const error = params.get("error");
  if (!error) return null;

  const dismiss = () => {
    const next = new URLSearchParams(params);
    next.delete("error");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-5 pt-4">
      <div
        role="alert"
        className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 shadow-sm"
      >
        <span aria-hidden className="mt-px">
          ⚠️
        </span>
        <div className="flex-1 text-sm text-red-800">
          <span className="font-semibold">Couldn’t complete that action.</span> {error}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded px-1.5 text-red-400 hover:bg-red-100 hover:text-red-700"
        >
          ×
        </button>
      </div>
    </div>
  );
}
