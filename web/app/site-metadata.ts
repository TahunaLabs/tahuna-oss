import { CDN_CONFIG, NETWORK_CONFIG } from "@/config"
import type { Metadata } from "next"

const SITE_TITLE = "Tahuna | A gentle control plane for post-training"
const SITE_DESCRIPTION =
  "A gentle control plane for post-training. Where AI agents practice, adapt, and improve through experience — no research lab required."

function faviconAsset(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.faviconPath}/${filename}`
}

export const siteMetadata: Metadata = {
  metadataBase: new URL(NETWORK_CONFIG.siteUrl),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "Tahuna",
  keywords: ["Tahuna", "post-training", "post-training infrastructure", "AI agent training", "RL", "Reinforcement Learning", "AI Training", "fine-tuning", "GPU infrastructure"],
  authors: [{ name: "Tahuna" }],
  creator: "Tahuna",
  openGraph: {
    type: "website",
    siteName: "Tahuna",
    url: NETWORK_CONFIG.siteUrl,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: faviconAsset("favicon.ico"), type: "image/x-icon" },
      { url: faviconAsset("favicon.svg"), type: "image/svg+xml" },
      { url: faviconAsset("favicon-96x96.png"), sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: faviconAsset("apple-touch-icon.png"), sizes: "180x180", type: "image/png" }],
    shortcut: [faviconAsset("favicon.ico")],
  },
}
