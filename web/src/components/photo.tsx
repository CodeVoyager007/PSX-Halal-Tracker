import Image from "next/image";

/** Unsplash photos used across the site, with the photographer credit Unsplash asks for. */
export const PHOTOS = {
  karachiNight: {
    src: "https://images.unsplash.com/photo-1759210720487-c74d9764da79",
    alt: "Aerial view of Karachi at night, streets glowing with light",
    credit: "Tahamie Farooqui",
    href: "https://unsplash.com/@tami171091",
  },
  karachiSunset: {
    src: "https://images.unsplash.com/photo-1744182896518-fd1233b5c568",
    alt: "Karachi skyline under a golden sunset",
    credit: "Tahamie Farooqui",
    href: "https://unsplash.com/@tami171091",
  },
  mosaic: {
    src: "https://images.unsplash.com/photo-1573765727997-e02883182ba7",
    alt: "Blue and gold geometric tile mosaic on a domed ceiling",
    credit: "Shayan Ghiasvand",
    href: "https://unsplash.com/@shayangh96",
  },
  phoneCoffee: {
    src: "https://images.unsplash.com/photo-1721152532394-e64789489a99",
    alt: "Person checking their phone at a café table beside a cup of coffee",
    credit: "Kate Trysh",
    href: "https://unsplash.com/@katetrysh",
  },
  mosque: {
    src: "https://images.unsplash.com/photo-1728046421058-1e1e28e57193",
    alt: "White mosque with a green roof and minaret against the sky",
    credit: "Alim",
    href: "https://unsplash.com/@apyfz",
  },
} as const;

export type PhotoKey = keyof typeof PHOTOS;

export function PhotoCredit({ photo, className = "" }: { photo: PhotoKey; className?: string }) {
  const p = PHOTOS[photo];
  return (
    <a
      href={`${p.href}?utm_source=psx_halal_tracker&utm_medium=referral`}
      target="_blank"
      rel="noopener noreferrer"
      className={`rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur-sm transition hover:text-white ${className}`}
    >
      Photo: {p.credit} / Unsplash
    </a>
  );
}

/** A photo that fills its (relatively positioned) parent. */
export function FillPhoto({
  photo,
  sizes,
  preload = false,
  className = "",
}: {
  photo: PhotoKey;
  sizes: string;
  preload?: boolean;
  className?: string;
}) {
  const p = PHOTOS[photo];
  return <Image src={p.src} alt={p.alt} fill sizes={sizes} preload={preload} className={`object-cover ${className}`} />;
}
