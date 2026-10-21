import { FillArt, type ArtKey } from "@/components/art";

/** Shared shell for text pages (About, Privacy, Terms): artwork banner, then readable prose. */
export default function ProsePage({
  art,
  eyebrow,
  title,
  intro,
  children,
}: {
  art: ArtKey;
  eyebrow: string;
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article>
      <header className="relative isolate overflow-hidden bg-[#04130d] text-white">
        <FillArt art={art} sizes="100vw" preload className="settle -z-20 opacity-50" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#04130d] via-[#04130d]/80 to-[#04130d]/30" aria-hidden="true" />
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <p className="fade-up text-sm font-semibold text-[#6ee7b7]">{eyebrow}</p>
          <h1 className="fade-up mt-2 text-4xl font-medium tracking-tight sm:text-5xl" style={{ "--delay": "0.1s" } as React.CSSProperties}>
            {title}
          </h1>
          {intro && (
            <p className="fade-up mt-4 max-w-2xl text-lg text-white/80" style={{ "--delay": "0.2s" } as React.CSSProperties}>
              {intro}
            </p>
          )}
        </div>
      </header>
      <div className="prose-page mx-auto max-w-3xl px-4 py-12 sm:px-6">{children}</div>
    </article>
  );
}
