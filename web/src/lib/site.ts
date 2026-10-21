/** Site-wide facts used by metadata, the sitemap, structured data and legal pages. */
export const SITE = {
  name: "PSX Halal Tracker",
  shortName: "Halal Tracker",
  // Set NEXT_PUBLIC_SITE_URL when moving to a custom domain
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://psx-halal-tracker.vercel.app").replace(/\/$/, ""),
  title: "PSX Halal Tracker: daily email for Shariah-compliant PSX stocks",
  description:
    "Follow Shariah-compliant Pakistan Stock Exchange companies from the KMI All-Share index and get one clear email after each trading day: closing prices, biggest movers and anything unusual. Free.",
  keywords: [
    "PSX", "Pakistan Stock Exchange", "halal stocks", "Shariah-compliant stocks", "KMI All-Share",
    "KMI-30", "Islamic investing Pakistan", "PSX closing prices", "stock alerts Pakistan", "halal watchlist",
  ],
  // Optional: shown on the About, Privacy and Terms pages when set
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || null,
  themeColor: "#047857",
  updated: "2026-10-21",
};
