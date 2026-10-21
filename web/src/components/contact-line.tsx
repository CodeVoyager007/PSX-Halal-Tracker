import { SITE } from "@/lib/site";

/** How to reach the operator: the configured address, or a reply to any digest (which comes from it). */
export default function ContactLine() {
  return SITE.contactEmail ? (
    <>
      email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
    </>
  ) : (
    <>reply to any digest email we have sent you</>
  );
}
