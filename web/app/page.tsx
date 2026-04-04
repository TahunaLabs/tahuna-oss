import { PublicHome } from "@/components/landing/public-home"
import { CDN_CONFIG, LINKS_CONFIG } from "@/config"
import { isAuthenticated } from "@/lib/auth-server"
import { redirect } from "next/navigation"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://tahuna.app"

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Tahuna",
      url: siteUrl,
      logo: `${CDN_CONFIG.baseUrl}${CDN_CONFIG.faviconPath}/favicon-96x96.png`,
      sameAs: [LINKS_CONFIG.repoUrl],
    },
    {
      "@type": "SoftwareApplication",
      name: "Tahuna",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Linux, macOS",
      url: siteUrl,
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
