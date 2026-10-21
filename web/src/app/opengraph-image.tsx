import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "PSX Halal Tracker: your halal PSX stocks in one daily email";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The preview card shown when the site is shared on WhatsApp, Facebook, X or LinkedIn. */
export default async function OpenGraphImage() {
  const hero = await readFile(join(process.cwd(), "src/assets/art/hero.jpg"));
  const heroSrc = `data:image/jpeg;base64,${hero.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#04130d" }}>
        <img src={heroSrc} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, objectFit: "cover" }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: "linear-gradient(90deg, rgba(4,19,13,0.97) 0%, rgba(4,19,13,0.85) 50%, rgba(4,19,13,0.2) 100%)",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", width: 820 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg viewBox="0 0 32 32" width="72" height="72">
              <rect width="32" height="32" rx="9" fill="#047857" />
              <path d="M20.5 7.5a9 9 0 1 0 4 12.3 7 7 0 1 1-4-12.3Z" fill="#e0b35c" opacity="0.95" />
              <path d="M9 21.5l4.2-4.4 3 2.6 6.3-7.2" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="22.5" cy="12.5" r="1.6" fill="#ffffff" />
            </svg>
            <span style={{ fontSize: 34, color: "#ffffff", fontWeight: 700 }}>PSX Halal Tracker</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 40, fontSize: 72, lineHeight: 1.08, color: "#ffffff" }}>
            <span>Your halal stocks,</span>
            <span style={{ color: "#e0b35c", fontStyle: "italic" }}>in one daily email.</span>
          </div>
          <div style={{ display: "flex", marginTop: 32, fontSize: 28, color: "rgba(255,255,255,0.8)" }}>
            Shariah-compliant PSX companies · KMI All-Share · Free
          </div>
        </div>
      </div>
    ),
    size,
  );
}
