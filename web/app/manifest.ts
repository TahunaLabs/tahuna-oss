import { CDN_CONFIG } from "@/config"
import type { MetadataRoute } from "next"

function faviconAsset(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.faviconPath}/${filename}`
}

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tahuna",
    short_name: "Tahuna",
    start_url: "/",
    display: "standalone",
    icons: [
      {
        src: faviconAsset("favicon-96x96.png"),
        sizes: "96x96",
        type: "image/png",
      },
      {
        src: faviconAsset("apple-touch-icon.png"),
        sizes: "180x180",
        type: "image/png",
      },
    ],
  }
}
