import { PublicHome } from "@/components/landing/public-home"
import { CDN_CONFIG, NETWORK_CONFIG } from "@/config"
import { isAuthenticated } from "@/lib/auth-server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Tahuna | Open-source compute infrastructure",
  description:
    "Run ML workloads on remote GPUs. Tahuna syncs your project, runs your Python entrypoint, saves the artifacts, and shuts the machine down.",
  alternates: { canonical: "/" },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Tahuna",
      url: NETWORK_CONFIG.siteUrl,
      logo: `${CDN_CONFIG.baseUrl}${CDN_CONFIG.faviconPath}/favicon-96x96.png`,
    },
    {
      "@type": "SoftwareApplication",
      name: "Tahuna",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Linux, macOS",
      url: NETWORK_CONFIG.siteUrl,
      description:
        "Open-source infrastructure for syncing Python projects, provisioning remote GPUs, running workloads, streaming metrics, and persisting artifacts.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
}

export default async function Home() {
  if (await isAuthenticated()) {
    redirect("/dashboard")
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PublicHome />
    </>
  )
}
