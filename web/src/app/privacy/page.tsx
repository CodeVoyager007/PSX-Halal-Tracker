import ProsePage from "@/components/prose-page";
import ContactLine from "@/components/contact-line";
import { SITE } from "@/lib/site";
import { fmtDate } from "@/lib/format";

export const metadata = {
  title: "Privacy Policy",
  description: "What PSX Halal Tracker collects, why, who processes it, and how to delete your account.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <ProsePage art="arches" eyebrow="Privacy Policy" title="Your data, plainly" intro={`Last updated ${fmtDate(SITE.updated)}.`}>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Your email address</strong>, to sign you in and send the emails you ask for.</li>
        <li><strong>Your watchlist</strong>: the companies you choose to follow.</li>
        <li><strong>Your email setting</strong>: daily, weekly or off.</li>
        <li><strong>A record of which digests were sent</strong>, so nobody gets the same email twice.</li>
      </ul>
      <p>
        We do not collect your name, phone number, payment details or brokerage information. We do not use advertising
        or tracking cookies, and we do not sell or share your data for marketing.
      </p>

      <h2>Cookies</h2>
      <p>
        We use only the cookies needed to keep you signed in. Without them the site cannot work, so there is nothing to opt
        out of.
      </p>

      <h2>Who processes your data</h2>
      <ul>
        <li><strong>Supabase</strong> stores your account, watchlist and settings, and handles sign-in.</li>
        <li><strong>Vercel</strong> hosts the website.</li>
        <li><strong>Google (Gmail)</strong> delivers sign-in links and digest emails.</li>
        <li><strong>GitHub</strong> runs the daily job that prepares and sends the digests.</li>
      </ul>
      <p>These services process data on our behalf and may store it outside Pakistan.</p>

      <h2>How long we keep it</h2>
      <p>
        For as long as you have an account. When you delete your account, your email address, watchlist, settings and
        digest history are deleted immediately.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li><strong>Stop emails</strong>: use the unsubscribe link in any email, or choose &quot;Off&quot; on your dashboard.</li>
        <li><strong>Change your watchlist</strong> any time on your dashboard.</li>
        <li>
          <strong>Delete your account</strong>: use &quot;Delete my account&quot; at the bottom of your dashboard. It is
          permanent and takes effect at once.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        For any privacy question or request, <ContactLine />.
      </p>
    </ProsePage>
  );
}
