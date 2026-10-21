"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { deleteAccount } from "./actions";

/** Two-step delete: the user must type DELETE, so one stray tap cannot erase an account. */
export default function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-medium text-secondary transition hover:border-loss hover:text-loss"
      >
        <Trash2 className="size-4" /> Delete my account
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-loss/30 bg-loss-soft p-4">
      <p className="text-sm text-primary">
        This permanently deletes your account, your watchlist and your email settings. It cannot be undone.
      </p>
      <label htmlFor="confirm-delete" className="mt-3 block text-sm font-medium">
        Type <strong>DELETE</strong> to confirm
      </label>
      <input
        id="confirm-delete"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        className="mt-2 w-full max-w-xs rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-loss focus:ring-4 focus:ring-loss/15"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={typed !== "DELETE" || pending}
          onClick={() =>
            startTransition(async () => {
              const res = await deleteAccount();
              if (res?.error) setError(res.error);
            })
          }
          className="inline-flex items-center gap-2 rounded-lg bg-loss px-4 py-2 text-sm font-medium text-white transition disabled:opacity-40"
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Permanently delete
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setError("");
          }}
          className="rounded-lg px-4 py-2 text-sm font-medium text-secondary hover:text-primary"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  );
}
