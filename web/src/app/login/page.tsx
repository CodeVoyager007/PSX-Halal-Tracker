import { CircleCheck, ShieldCheck } from "lucide-react";
import { safeNext } from "@/lib/format";
import { LogoMark } from "@/components/logo";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in · PSX Halal Tracker" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const linkFailed = params.error === "link";

  return (
    <div className="hero-glow">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-2">
        {/* Brand panel */}
        <div className="hidden lg:block">
          <LogoMark className="size-12" />
          <h1 className="mt-8 text-4xl font-semibold leading-tight tracking-tight">
            Follow halal PSX stocks
            <br />
            <span className="text-brand">the calm way.</span>
          </h1>
          <ul className="mt-8 space-y-4 text-secondary">
            {[
              "300+ Shariah-compliant companies from the KMI All-Share index",
              "One email after each trading day, or weekly on Fridays",
              "Charts with 50- and 200-day averages for every company",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-brand" /> {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Form card */}
        <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-lift sm:p-10">
          <LogoMark className="size-10 lg:hidden" />
          <h2 className="mt-6 text-2xl font-semibold tracking-tight lg:mt-0">Sign in or create an account</h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            Enter your email and we&apos;ll send you a secure sign-in link. No password needed.
          </p>
          {linkFailed && (
            <p role="alert" className="mt-5 rounded-xl border border-loss/30 bg-loss-soft p-3.5 text-sm text-loss">
              That sign-in link has expired or was already used. Request a new one, and open it in this browser.
            </p>
          )}
          <LoginForm next={next} />
          <p className="mt-8 flex items-center gap-2 border-t border-line pt-6 text-xs text-muted">
            <ShieldCheck className="size-4 shrink-0" /> We only use your email to sign you in and send the digests you
            choose.
          </p>
        </div>
      </div>
    </div>
  );
}
