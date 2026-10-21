import Link from "next/link";
import ProsePage from "@/components/prose-page";
import ContactLine from "@/components/contact-line";

export const metadata = {
  title: "About",
  description:
    "How PSX Halal Tracker works: which companies count as halal, where the closing prices come from, how they are verified, and who it is for.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <ProsePage
      art="city"
      eyebrow="About"
      title="Halal PSX investing, without the noise"
      intro="A free daily email about the Shariah-compliant Pakistan Stock Exchange companies you care about."
    >
      <h2>What it does</h2>
      <p>
        You choose companies from the Shariah-compliant list. After each trading day we email you their closing prices,
        the biggest movers, unusual trading volume and RSI extremes, either every trading day or once a week on Fridays.
        The website shows the same companies with 12-month charts, 52-week ranges, returns and basic fundamentals.
      </p>

      <h2>Which companies are halal</h2>
      <p>
        We do not screen companies ourselves. The list is exactly the <strong>KMI All-Share index</strong>, which the
        Pakistan Stock Exchange maintains with Al Meezan Investments using published Shariah criteria (business activity,
        interest-bearing debt, non-compliant income and similar tests). We check the index every week; when a company
        leaves it, it disappears from the list automatically.
      </p>

      <h2>Where the prices come from</h2>
      <ul>
        <li>
          <strong>Closing prices</strong> come from PSX&apos;s official daily market summary file, downloaded after the
          market closes each trading day.
        </li>
        <li>
          <strong>Every price is cross-checked</strong> against an independent source (SCS Trade). Prices that agree are
          marked as confirmed; any disagreement is flagged rather than hidden.
        </li>
        <li>
          <strong>Fundamentals</strong> such as P/E, EPS, dividend yield and market cap come from TradingView&apos;s market
          screener.
        </li>
        <li>Indicators (moving averages, RSI, MACD, volume spikes, returns) are calculated by us from the stored prices.</li>
      </ul>

      <h2>What it is not</h2>
      <p>
        It is not investment advice and never tells you to buy or sell. Prices are end-of-day, not live. Please consult a
        licensed adviser before making investment decisions. See our <Link href="/terms">Terms</Link>.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, corrections or ideas: <ContactLine />.
      </p>
    </ProsePage>
  );
}
