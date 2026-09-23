import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl py-12">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Track the halal PSX stocks you care about.
      </h1>
      <p className="mt-4 text-lg text-secondary">
        Pick any of the ~300 Shariah-compliant companies in the KMI All-Share index. Every trading day
        after the market closes, you get one email with how your companies moved.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-block rounded-md bg-accent px-5 py-2.5 font-medium text-accent-ink"
      >
        Get started, it&apos;s free
      </Link>

      <ul className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          ["Your watchlist", "Follow up to 50 companies, searchable by name, ticker or sector."],
          ["Daily or weekly email", "Closing prices, biggest movers, unusual volume and RSI extremes."],
          ["Shariah-screened", "Only companies in the official KMI All-Share index, refreshed weekly."],
        ].map(([title, body]) => (
          <li key={title} className="rounded-lg border border-line bg-surface p-4">
            <h2 className="font-medium">{title}</h2>
            <p className="mt-1 text-sm text-secondary">{body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
