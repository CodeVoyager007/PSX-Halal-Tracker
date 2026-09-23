import { redirect } from "next/navigation";
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

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Email digest</h1>
      {status === "done" ? (
        <p className="mt-4 text-secondary">
          You&apos;re unsubscribed and won&apos;t get more digests. You can turn them back on from your dashboard at
          any time.
        </p>
      ) : status === "invalid" || typeof token !== "string" ? (
        <p className="mt-4 text-secondary">
          This unsubscribe link isn&apos;t valid. Sign in and turn the digest off from your dashboard instead.
        </p>
      ) : (
        <form action={confirmUnsubscribe} className="mt-4">
          <p className="text-secondary">Stop receiving the watchlist digest email?</p>
          <input type="hidden" name="token" value={token} />
          <button className="mt-4 rounded-md bg-accent px-4 py-2 font-medium text-accent-ink">Unsubscribe</button>
        </form>
      )}
    </div>
  );
}
