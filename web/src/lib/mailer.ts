import nodemailer from "nodemailer";

/**
 * Sends mail through the same SMTP account as the daily job (Gmail with an App
 * Password by default). Server-only: SMTP_USER and SMTP_PASSWORD are never
 * prefixed NEXT_PUBLIC_, so they stay out of the browser bundle.
 */
export function mailerConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export async function sendMail(message: {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}) {
  const user = process.env.SMTP_USER!;
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass: process.env.SMTP_PASSWORD! },
  });
  await transport.sendMail({
    from: process.env.DIGEST_FROM || `"PSX Halal Tracker" <${user}>`,
    ...message,
  });
}
