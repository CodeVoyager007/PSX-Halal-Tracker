import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, MailCheck, MailX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Unsubscribe · PSX Halal Tracker" };

async function confirmUnsubscribe(formData: FormData) {
  "use server";
  const token = formData.get("token");
  if (typeof token !== "string") redirect("/unsubscribe?status=invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe_digest", { token });
  redirect(`/unsubscribe?status=${!error && data ? "done" : "invalid"}`);
}

/**
 * The email's unsubscribe link lands here. It asks for a click rather than
 * unsubscribing on page load, because email security scanners open links
 * automatically. One-click unsubscribe from the mail client uses /api/unsubscribe.
 */
export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const { token, status } = await searchParams;

  const done = status === "done";
  const invalid = status === "invalid" || typeof token !== "string";
  const Icon = done ? MailCheck : invalid ? MailX : Mail;

  return (
    <div className="hero-glow">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-4 py-12">
        <div className="w-full rounded-2xl border border-line bg-surface p-8 text-center shadow-lift sm:p-10">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-soft-ink">
            <Icon className="size-6" />
          </span>
          {done ? (
            <>
              <h1 className="mt-6 text-2xl font-semibold tracking-tight">You&apos;re unsubscribed</h1>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                You won&apos;t receive any more digest emails. You can turn them back on from your dashboard at any time.
              </p>
            </>
          ) : invalid ? (
            <>
              <h1 className="mt-6 text-2xl font-semibold tracking-tight">This link isn&apos;t valid</h1>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                Sign in and switch the digest off from your dashboard instead.
              </p>
            </>
          ) : (
            <form action={confirmUnsubscribe}>
              <h1 className="mt-6 text-2xl font-semibold tracking-tight">Stop the email digest?</h1>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                You&apos;ll stop receiving watchlist emails. Your watchlist and account stay as they are.
              </p>
              <input type="hidden" name="token" value={token} />
              <button className="mt-6 w-full rounded-xl bg-brand px-4 py-3 font-medium text-brand-ink shadow-card transition hover:bg-brand-strong">
                Unsubscribe
              </button>
            </form>
          )}
          <Link href="/dashboard" className="mt-6 inline-block text-sm font-medium text-brand hover:underline">
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
