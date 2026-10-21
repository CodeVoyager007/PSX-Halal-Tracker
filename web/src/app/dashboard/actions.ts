"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
