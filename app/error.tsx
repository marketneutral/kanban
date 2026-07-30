"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-md px-5 py-20 text-center">
      <p className="text-3xl">🚧</p>
      <h1 className="mt-3 text-lg font-semibold text-stone-900">That didn’t go through</h1>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">
        {error.message?.includes("Gate not met") || error.message?.includes("Only")
          ? error.message
          : "The action was blocked — usually a gate requirement or a role permission. Go back and check the stage gate panel."}
      </p>
      <button
        onClick={() => reset()}
        className="mt-5 rounded-md bg-accent-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-800"
      >
        Go back
      </button>
    </div>
  );
}
