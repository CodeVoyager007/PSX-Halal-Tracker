import { safeNext } from "@/lib/format";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in · PSX Halal Tracker" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const linkFailed = params.error === "link";

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-secondary">
        Enter your email and we&apos;ll send you a sign-in link. No password needed; new accounts are
        created automatically.
      </p>
      {linkFailed && (
        <p role="alert" className="mt-4 rounded-md border border-line bg-surface p-3 text-sm">
          That sign-in link has expired or was already used. Request a new one below, and open it in
          the same browser.
        </p>
      )}
      <LoginForm next={next} />
    </div>
  );
}
