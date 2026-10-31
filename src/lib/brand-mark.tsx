/**
 * The Recut mark (the same waveform tile as the top-bar Logo) for ImageResponse routes:
 * favicons, the Apple touch icon, PWA icons and the social preview image.
 */
export const BRAND_GRADIENT = "linear-gradient(135deg, #2b95ff 0%, #5e5ce6 50%, #bf5af2 100%)";

export function BrandMark({ size, radius = 0.32, inset = 0 }: { size: number; radius?: number; inset?: number }) {
  // `inset` shrinks the waveform inside the tile, e.g. for maskable icons that get cropped to a circle.
  const glyph = size * (0.58 - inset);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: size * radius,
        backgroundImage: BRAND_GRADIENT,
      }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round">
        <path d="M5 9v6M9 6v12M13 9.5v5M17 7.5v9" />
        <path d="M19.5 12h.01" strokeWidth={3} />
      </svg>
    </div>
  );
}
