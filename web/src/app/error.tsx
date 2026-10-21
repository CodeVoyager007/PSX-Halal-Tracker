"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // Shows up in Vercel's runtime logs
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-loss-soft text-loss">
        <TriangleAlert className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-secondary">
        This is on our side, not yours. Please try again in a moment; your watchlist and settings are safe.
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-medium text-brand-ink shadow-card transition hover:bg-brand-strong"
        >
          <RotateCw className="size-4" /> Try again
        </button>
        <Link href="/" className="rounded-xl border border-line px-5 py-3 font-medium text-secondary transition hover:text-primary">
          Home page
        </Link>
      </div>
    </section>
  );
}
