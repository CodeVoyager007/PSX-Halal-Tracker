"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, MailCheck, Send } from "lucide-react";
import { sendDigestNow, type SendResult } from "./actions";

/** Sends the latest digest immediately, with a clear result message. */
export default function EmailNow() {
  const [result, setResult] = useState<SendResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-secondary">Don&apos;t want to wait for 5 PM? Get the latest update now.</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setResult(await sendDigestNow()))}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-ink shadow-card transition hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          Email me today&apos;s update
        </button>
      </div>
      {result && (
        <p
          role="status"
          className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            result.error ? "bg-loss-soft text-loss" : "bg-gain-soft text-gain"
          }`}
        >
          {!result.error && <MailCheck className="mt-0.5 size-4 shrink-0" />}
          {result.sent
            ? `Sent! Check ${result.email} (and Spam, the first time).`
            : result.already
              ? "You already have the latest update in your inbox. The next one comes after the next trading day."
              : result.error}
        </p>
      )}
    </div>
  );
}
