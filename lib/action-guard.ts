import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Next.js masks errors thrown from server actions in production, so a user
 * who trips a validation or permission rule sees an opaque error page.
 * `guard` wraps an action: on failure it redirects back to the page the form
 * was on with the real message in `?error=`, which the layout's banner shows.
 */
export function guard<A extends unknown[]>(
  fn: (...args: A) => Promise<void>
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (e) {
      // Next's own control flow (redirect, notFound) travels as exceptions.
      if (
        e &&
        typeof e === "object" &&
        "digest" in e &&
        String((e as { digest: unknown }).digest).startsWith("NEXT_")
      ) {
        throw e;
      }

      const message =
        e instanceof Error && e.message && e.message.length <= 300
          ? e.message
          : "Something went wrong — please try again";

      // A stale seat (30 min idle) means the whole session is gone.
      if (message === "Not signed in") redirect("/signin?expired=1");

      let base = "/board";
      const referer = (await headers()).get("referer");
      if (referer) {
        try {
          const u = new URL(referer);
          u.searchParams.delete("error");
          base = u.pathname + (u.searchParams.size ? `?${u.searchParams}` : "");
        } catch {
          /* keep fallback */
        }
      }
      const sep = base.includes("?") ? "&" : "?";
      redirect(`${base}${sep}error=${encodeURIComponent(message)}`);
    }
  };
}
