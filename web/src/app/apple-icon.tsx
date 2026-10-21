import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the brand mark on a full-bleed emerald square (iOS rounds the corners). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#047857" }}>
        <svg viewBox="0 0 32 32" width="180" height="180">
          <path d="M20.5 7.5a9 9 0 1 0 4 12.3 7 7 0 1 1-4-12.3Z" fill="#e0b35c" opacity="0.95" />
          <path d="M9 21.5l4.2-4.4 3 2.6 6.3-7.2" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="22.5" cy="12.5" r="1.6" fill="#ffffff" />
        </svg>
      </div>
    ),
    size,
  );
}
