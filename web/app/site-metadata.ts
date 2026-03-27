import { CDN_CONFIG, NETWORK_CONFIG } from "@/config"
import type { Metadata } from "next"

const SITE_TITLE = "Tahuna | The RL Training Substrate"
const SITE_DESCRIPTION =
  "The RL training substrate. Where AI agents practice, adapt, and improve through experience — no research lab required."
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || NETWORK_CONFIG.defaultApiUrl

function faviconAsset(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.faviconPath}/${filename}`
}

function artefactAsset(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/${filename}`
}

const socialImageUrl = artefactAsset("opengraph.png")

export const siteMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "Tahuna",
  keywords: ["Tahuna", "RL", "Reinforcement Learning", "AI Training", "Post-training", "Agents", "Infrastructure"],
  authors: [{ name: "Tahuna" }],
  creator: "Tahuna",
  openGraph: {
    type: "website",
    siteName: "Tahuna",
    url: siteUrl,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: socialImageUrl }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [socialImageUrl],
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
