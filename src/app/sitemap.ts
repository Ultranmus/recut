import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Uploaded projects live only in the visitor's browser, so the home page and demo are the public pages.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/studio/demo`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
