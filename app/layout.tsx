import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/session";
import { signOut } from "@/app/actions/auth";
import { isAdmin, ROLE_LABELS, type Role } from "@/lib/types";
import { initials } from "@/lib/format";

export const metadata: Metadata = {
  title: "Allocator — Investment Process",
  description: "Manager allocation pipeline: kanban, documents, gated approvals",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-5">
            <Link href="/board" className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-accent-700 font-mono text-sm font-bold text-white">
                A
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-stone-900">
                Allocator
              </span>
            </Link>
            {user && (
              <nav className="flex items-center gap-1 text-sm">
                <NavLink href="/board">Board</NavLink>
                <NavLink href="/reports">Reports</NavLink>
                {isAdmin(user) && <NavLink href="/admin">Admin</NavLink>}
              </nav>
            )}
            <div className="ml-auto flex items-center gap-3">
              {user ? (
                <>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-100 text-xs font-semibold text-accent-800">
                      {initials(user.name)}
                    </span>
                    <div className="leading-tight">
                      <div className="text-[13px] font-medium text-stone-900">{user.name}</div>
                      <div className="text-[11px] text-stone-500">
                        {user.roles.map((r) => ROLE_LABELS[r.role as Role] ?? r.role).join(" · ")}
                      </div>
                    </div>
                  </div>
                  <form action={signOut}>
                    <button
                      className="rounded-md px-2.5 py-1.5 text-[13px] text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                      type="submit"
                    >
                      Sign out
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-2.5 py-1.5 font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
    >
      {children}
    </Link>
  );
}
