import Link from "next/link";
import { LayoutDashboard, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import Logo from "./logo";

export default async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-page/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        {user ? (
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/dashboard"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 font-medium text-secondary hover:bg-surface-2 hover:text-primary sm:flex"
            >
              <LayoutDashboard className="size-4" /> Dashboard
            </Link>
            <span
              className="grid size-9 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-soft-ink"
              title={user.email ?? undefined}
            >
              {(user.email ?? "?").charAt(0).toUpperCase()}
            </span>
            <form action="/auth/signout" method="post">
              <button
                className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-primary"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-sm sm:gap-2">
            <div className="hidden items-center md:flex">
              {[
                ["#features", "Features"],
                ["#how", "How it works"],
                ["#faq", "FAQ"],
              ].map(([href, label]) => (
                <a key={href} href={`/${href}`} className="rounded-lg px-3 py-2 text-secondary hover:text-primary">
                  {label}
                </a>
              ))}
            </div>
            <Link href="/login" className="rounded-lg px-3 py-2 font-medium text-secondary hover:text-primary">
              Sign in
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-brand px-4 py-2 font-medium text-brand-ink shadow-card transition hover:bg-brand-strong"
            >
              Get started
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
