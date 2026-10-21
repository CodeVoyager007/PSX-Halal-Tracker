"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { renderDigest } from "@/lib/digest-email";
import { mailerConfigured, sendMail } from "@/lib/mailer";
import { SITE } from "@/lib/site";
import type { SnapshotRow } from "@/lib/types";

// All writes go through the signed-in user's session, so the RLS policies in
// db/schema.sql decide what is allowed; these actions only translate errors.

export async function addTicker(ticker: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("watchlists").insert({ ticker });
  if (error) {
    if (error.code === "23514") return { error: "You can follow up to 50 companies. Remove one to add another." };
    if (error.code === "23505") return { error: `${ticker} is already on your watchlist.` };
    return { error: "Could not add that company. Please try again." };
  }
  revalidatePath("/dashboard");
  return {};
}

/** Form-action version of addTicker for the stock page's follow button. */
export async function addTickerForm(formData: FormData) {
  const ticker = formData.get("ticker");
  if (typeof ticker !== "string") return;
  const result = await addTicker(ticker);
  if (!result.error) revalidatePath(`/stocks/${ticker}`);
}

export async function removeTicker(formData: FormData) {
  const ticker = formData.get("ticker");
  if (typeof ticker !== "string") return;
  const supabase = await createClient();
  const { error } = await supabase.from("watchlists").delete().eq("ticker", ticker);
  if (error) return;
  revalidatePath("/dashboard");
  revalidatePath(`/stocks/${ticker}`);
}

export type DigestChoice = "daily" | "weekly" | "off";

/** Daily, weekly (Fridays) or no digest; saved as soon as the user picks. */
export async function setDigest(choice: DigestChoice): Promise<{ error?: string }> {
  if (choice !== "daily" && choice !== "weekly" && choice !== "off") return { error: "Unknown option." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  // "Off" keeps the last frequency, so switching back on restores it
  const update = choice === "off" ? { digest_enabled: false } : { digest_enabled: true, digest_frequency: choice };
  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) return { error: "Could not save. Please try again." };
  revalidatePath("/dashboard");
  return {};
}

/** Permanently delete the signed-in user's account and everything tied to it. */
export async function deleteAccount(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error: "Could not delete your account. Please try again." };
  await supabase.auth.signOut();
  redirect("/?deleted=1");
}

export type SendResult = { sent?: boolean; already?: boolean; error?: string; email?: string; marketDate?: string };

/**
 * Email the signed-in user their digest for the latest market date right now.
 * The date is claimed first (claim_digest), so the 5 PM job will not send the
 * same date again; a failed send releases the claim so the job can retry.
 */
export async function sendDigestNow(intro?: string): Promise<SendResult> {
  if (!mailerConfigured()) return { error: "Email sending isn't set up on the website yet. Your email will arrive after 5 PM." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  const [{ data: profile }, { data: watch }] = await Promise.all([
    supabase.from("profiles").select("email, unsubscribe_token").eq("id", user.id).single(),
    supabase.from("watchlists").select("ticker"),
  ]);
  const tickers = (watch ?? []).map((w) => w.ticker as string);
  if (!profile?.email || tickers.length === 0) return { error: "Add at least one company first." };

  const { data: rows } = await supabase.from("latest_snapshot").select("*").in("ticker", tickers).returns<SnapshotRow[]>();
  const withData = (rows ?? []).filter((r) => r.trade_date);
  const marketDate = withData.reduce<string | null>((max, r) => (!max || r.trade_date! > max ? r.trade_date : max), null);
  if (!marketDate) return { error: "No prices are available for your companies yet." };

  const { data: claimed, error: claimError } = await supabase.rpc("claim_digest", { market_date: marketDate });
  if (claimError) return { error: "Could not send right now. Please try again." };
  if (!claimed) return { already: true, email: profile.email, marketDate };

  const unsubscribeUrl = `${SITE.url}/unsubscribe?token=${profile.unsubscribe_token}`;
  const { subject, html, text } = renderDigest(withData, marketDate, SITE.url, unsubscribeUrl, intro);
  try {
    await sendMail({
      to: profile.email,
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${SITE.url}/api/unsubscribe?token=${profile.unsubscribe_token}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (e) {
    console.error("sendDigestNow failed", e);
    await supabase.rpc("release_digest", { market_date: marketDate });
    return { error: "We couldn't send the email just now. It will still arrive after 5 PM." };
  }
  return { sent: true, email: profile.email, marketDate };
}

/**
 * Finish first-time setup in one step: save the chosen companies and email
 * frequency, then send the first email straight away.
 */
export async function completeSetup(tickers: string[], choice: DigestChoice): Promise<SendResult & { saved?: boolean }> {
  const unique = [...new Set(tickers.filter((t) => typeof t === "string" && /^[A-Z0-9.-]{1,12}$/.test(t)))].slice(0, 50);
  if (unique.length === 0) return { error: "Pick at least one company." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  // RLS only lets users add active tickers to their own list
  const { error } = await supabase.from("watchlists").upsert(unique.map((ticker) => ({ ticker })), {
    onConflict: "user_id,ticker",
    ignoreDuplicates: true,
  });
  if (error) return { error: "Could not save your companies. Please try again." };
  const digest = await setDigest(choice);
  if (digest.error) return { error: digest.error };
  revalidatePath("/dashboard");

  if (choice === "off") return { saved: true };
  const sent = await sendDigestNow("Welcome! Here is where your companies closed. From now on this arrives automatically.");
  return { saved: true, ...sent };
}
