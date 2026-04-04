import type { MetadataRoute } from "next"

import { NETWORK_CONFIG } from "@/config"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/api/", "/auth/"],
      },
    ],
    sitemap: `${NETWORK_CONFIG.siteUrl}/sitemap.xml`,
  }
}
