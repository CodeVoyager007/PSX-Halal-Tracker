import Image, { type StaticImageData } from "next/image";
import arches from "@/assets/art/arches.jpg";
import city from "@/assets/art/city.jpg";
import email from "@/assets/art/email.jpg";
import hero from "@/assets/art/hero.jpg";
import shariah from "@/assets/art/shariah.jpg";

/** Artwork generated for this site. Static imports give Next.js sizes and blur placeholders. */
export const ART = {
  hero: { src: hero, alt: "Karachi skyline at dusk with a glowing gold chart line rising over the city" },
  shariah: { src: shariah, alt: "Eight-point Islamic star pattern in emerald glass with gold inlay" },
  email: { src: email, alt: "Emerald glass envelope releasing a rising gold chart line" },
  city: { src: city, alt: "Painted coastal city at golden hour" },
  arches: { src: arches, alt: "Marble courtyard arches with golden lanterns at dusk" },
} satisfies Record<string, { src: StaticImageData; alt: string }>;

export type ArtKey = keyof typeof ART;

/** Artwork that fills its (relatively positioned) parent. */
export function FillArt({
  art,
  sizes,
  preload = false,
  className = "",
}: {
  art: ArtKey;
  sizes: string;
  preload?: boolean;
  className?: string;
}) {
  const a = ART[art];
  return (
    <Image
      src={a.src}
      alt={a.alt}
      fill
      sizes={sizes}
      preload={preload}
      placeholder="blur"
      className={`object-cover ${className}`}
    />
  );
}
