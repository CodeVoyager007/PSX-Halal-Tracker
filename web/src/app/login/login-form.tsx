"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle, Mail, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm({
  next,
  autoFocus = true,
  cta = "Email me a sign-in link",
}: {
  next: string;
  autoFocus?: boolean;
  cta?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch"
        ? err.message
        : "We couldn't reach the sign-in service. Please try again in a moment.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div role="status" className="mt-8 rounded-xl border border-line bg-brand-soft p-5 text-center">
        <MailCheck className="mx-auto size-8 text-brand" />
        <p className="mt-3 font-semibold text-primary">Check your inbox</p>
        <p className="mt-1 text-sm text-secondary">
          We sent a sign-in link to <strong className="text-primary">{email}</strong>. Open it on this device to
          continue. It expires in one hour.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-4 text-sm font-medium text-brand hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email address
        </label>
        <div className="relative mt-2">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            autoFocus={autoFocus}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface py-3 pl-10 pr-3 outline-none transition placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand/15"
            placeholder="you@example.com"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={status === "sending"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-medium text-brand-ink shadow-card transition hover:bg-brand-strong disabled:opacity-70"
      >
        {status === "sending" ? (
          <>
            <LoaderCircle className="size-4 animate-spin" /> Sending link…
          </>
        ) : (
          <>
            {cta} <ArrowRight className="size-4" />
          </>
        )}
      </button>
      {status === "error" && (
        <p role="alert" className="rounded-xl bg-loss-soft p-3 text-sm text-loss">
          {error}
        </p>
      )}
    </form>
  );
}
