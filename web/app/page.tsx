import { PublicHome } from "@/components/landing/public-home"
import { CDN_CONFIG, NETWORK_CONFIG } from "@/config"
import { isAuthenticated } from "@/lib/auth-server"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Tahuna | A gentle control plane for post-training",
  description:
    "Train, fine-tune, and run reinforcement learning on your AI models — no research lab required. Tahuna gives you full control over post-training with managed GPU infrastructure.",
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
        "A gentle control plane for post-training. Where AI agents practice, adapt, and improve through experience — no research lab required.",
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
