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
  await addTicker(ticker);
  revalidatePath(`/stocks/${ticker}`);
}

export async function removeTicker(formData: FormData) {
  const ticker = formData.get("ticker");
  if (typeof ticker !== "string") return;
  const supabase = await createClient();
  await supabase.from("watchlists").delete().eq("ticker", ticker);
  revalidatePath("/dashboard");
  revalidatePath(`/stocks/${ticker}`);
}

export async function updateDigest(formData: FormData) {
  const frequency = formData.get("frequency");
  if (frequency !== "daily" && frequency !== "weekly") return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profiles")
    .update({ digest_enabled: formData.get("enabled") === "on", digest_frequency: frequency })
    .eq("id", user.id);
  revalidatePath("/dashboard");
}
