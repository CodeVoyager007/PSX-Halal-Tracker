"use client";

import { useState, useTransition } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { setDigest, type DigestChoice } from "./actions";

const OPTIONS: { value: DigestChoice; label: string; hint: string }[] = [
  { value: "daily", label: "Daily", hint: "Each trading day, ~5 PM" },
  { value: "weekly", label: "Weekly", hint: "Fridays" },
  { value: "off", label: "Off", hint: "No emails" },
];

/** Three big choices that save on tap; no separate Save button to forget. */
export default function DigestPicker({ value, email }: { value: DigestChoice; email: string | null }) {
  const [current, setCurrent] = useState(value);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function choose(next: DigestChoice) {
    if (next === current || pending) return;
    const previous = current;
    setCurrent(next);
    setStatus("idle");
    startTransition(async () => {
      const res = await setDigest(next);
      if (res.error) {
        setCurrent(previous);
        setError(res.error);
        setStatus("error");
      } else {
        setStatus("saved");
      }
    });
  }

  return (
    <div>
      <div role="radiogroup" aria-label="How often to email you" className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => {
          const selected = o.value === current;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(o.value)}
              className={`flex flex-col items-start gap-2 rounded-xl border px-3 py-3 text-left transition sm:flex-row sm:items-center sm:gap-3 sm:px-4 ${
                selected
                  ? "border-brand bg-brand-soft ring-2 ring-brand/20"
                  : "border-line bg-surface hover:border-line-strong hover:bg-surface-2"
              }`}
            >
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                  selected ? "border-brand bg-brand text-brand-ink" : "border-line-strong"
                }`}
                aria-hidden="true"
              >
                {selected && <Check className="size-3.5" />}
              </span>
              <span>
                <span className="block font-medium">{o.label}</span>
                <span className="block text-xs text-muted">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex min-h-5 items-center gap-1.5 text-sm text-muted" aria-live="polite">
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" /> Saving…
          </>
        ) : status === "saved" ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gain-soft px-3 py-1.5 font-medium text-gain">
            <Check className="size-4" />
            {current === "off"
              ? "Saved. Emails are off."
              : current === "weekly"
                ? "Saved. You'll get an email every Friday after the close."
                : "Saved. You'll get an email every trading day around 5 PM."}
          </span>
        ) : status === "error" ? (
          <span className="text-loss">{error}</span>
        ) : current === "off" ? (
          "You won't get emails. Your watchlist stays here."
        ) : (
          <span>
            Emails go to {email ? <strong className="font-medium text-primary">{email}</strong> : "your address"}
          </span>
        )}
      </p>
    </div>
  );
}
