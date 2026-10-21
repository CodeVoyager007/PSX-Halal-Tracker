/** Placeholder shown while a signed-in page loads its data. */
export default function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6" aria-busy="true" aria-label="Loading">
      <div className="h-32 animate-pulse rounded-3xl bg-gradient-to-br from-[#065f46]/60 via-[#047857]/50 to-[#0f766e]/40" />
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-6 shadow-card">
        <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-10 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-4 flex-1 animate-pulse rounded bg-surface-2" />
            <div className="h-4 w-16 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
