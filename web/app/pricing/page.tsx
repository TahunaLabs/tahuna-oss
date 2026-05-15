import type { Metadata } from "next"

import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingNav } from "@/components/landing/landing-nav"
import { LandingPricingSection } from "@/components/landing/landing-pricing-section"

export const metadata: Metadata = {
  title: "Pricing | Tahuna",
  description: "Tahuna pricing for managed GPU compute, attached volume, and storage growth.",
  alternates: { canonical: "/pricing" },
}

export default function PricingPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="min-h-full bg-background/70 backdrop-blur-sm">
        <LandingNav />
        <main>
          <LandingPricingSection />
        </main>
        <LandingFooter />
      </div>
    </div>
  )
}
