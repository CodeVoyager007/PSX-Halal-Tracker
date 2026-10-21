import Link from "next/link";
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
          <div className="flex items-center gap-1 text-sm">
            <Link href="/dashboard" className="rounded-lg px-3 py-2 font-medium text-secondary hover:bg-surface-2 hover:text-primary">
              My watchlist
            </Link>
            <form action="/auth/signout" method="post">
              <button className="rounded-lg px-3 py-2 text-muted hover:bg-surface-2 hover:text-primary" title={user.email ?? undefined}>
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="whitespace-nowrap rounded-lg border border-line px-4 py-2 text-sm font-medium text-secondary transition hover:border-brand hover:text-brand"
          >
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
