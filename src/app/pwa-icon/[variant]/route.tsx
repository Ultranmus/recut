import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brand-mark";

const VARIANTS = {
  "48.png": { size: 48, radius: 0.28, inset: 0 },
  "192.png": { size: 192, radius: 0.22, inset: 0 },
  "512.png": { size: 512, radius: 0.22, inset: 0 },
  // Maskable icons are cropped to a circle or squircle by the OS, so keep the glyph in the safe zone.
  "maskable-512.png": { size: 512, radius: 0, inset: 0.14 },
} as const;

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

// PNG icons for the web app manifest, rendered from the same mark as the favicon.
export async function GET(_request: Request, { params }: RouteContext<"/pwa-icon/[variant]">) {
  const v = VARIANTS[(await params).variant as keyof typeof VARIANTS];
  if (!v) return new Response("Not found", { status: 404 });
  return new ImageResponse(<BrandMark size={v.size} radius={v.radius} inset={v.inset} />, { width: v.size, height: v.size });
}
