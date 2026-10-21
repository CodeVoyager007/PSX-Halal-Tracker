import Link from "next/link";
import ProsePage from "@/components/prose-page";
import ContactLine from "@/components/contact-line";
import { SITE } from "@/lib/site";
import { fmtDate } from "@/lib/format";

export const metadata = {
  title: "Terms of Use",
  description: "The terms for using PSX Halal Tracker: information only, not investment advice, no warranty.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <ProsePage art="shariah" eyebrow="Terms of Use" title="The simple rules" intro={`Last updated ${fmtDate(SITE.updated)}.`}>
      <h2>Information only, not advice</h2>
      <p>
        {SITE.name} provides market information for general purposes. It is <strong>not investment, financial, legal or
        religious advice</strong>, and nothing on the site or in our emails is a recommendation to buy, sell or hold any
        security. Make your own decisions, and consult a licensed adviser where appropriate.
      </p>

      <h2>Shariah compliance</h2>
      <p>
        Which companies appear is determined entirely by the KMI All-Share index published by the Pakistan Stock Exchange.
        We do not issue Shariah rulings. Index membership can change; check with a qualified scholar or your Islamic fund
        if compliance matters to a decision.
      </p>

      <h2>Accuracy</h2>
      <p>
        Prices are end-of-day figures from PSX&apos;s official files, cross-checked against an independent source, and
        fundamentals come from third parties. Data can still be delayed, incomplete or wrong. The service is provided
        &quot;as is&quot;, without warranties of any kind, and we are not liable for losses arising from its use.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Use an email address you control, and keep your sign-in links private.</li>
        <li>Do not misuse the service: no automated scraping, overloading, or attempts to access other users&apos; data.</li>
        <li>You can stop emails or delete your account at any time from your dashboard.</li>
      </ul>

      <h2>Changes</h2>
      <p>
        We may update the service or these terms. Material changes will be reflected in the date above. Continuing to use
        the service means you accept the current terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <ContactLine />. See also our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </ProsePage>
  );
}
