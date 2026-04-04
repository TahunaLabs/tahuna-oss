import type { MetadataRoute } from "next"

import { NETWORK_CONFIG } from "@/config"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: NETWORK_CONFIG.siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${NETWORK_CONFIG.siteUrl}/login`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ]
}
