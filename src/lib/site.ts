/** Absolute site URL for metadata, robots and the sitemap. Set NEXT_PUBLIC_SITE_URL for a custom domain. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  "http://localhost:3210"
).replace(/\/$/, "");

export const SITE_NAME = "Recut";
export const SITE_DESCRIPTION =
  "Upload a podcast or video. Recut finds the moments worth sharing and writes captions for Instagram Reels, LinkedIn, X and YouTube Shorts, in your brand voice.";
