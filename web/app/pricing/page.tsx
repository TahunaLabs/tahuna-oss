import type { Metadata } from "next"

import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingNav } from "@/components/landing/landing-nav"
import { LandingPricingSection } from "@/components/landing/landing-pricing-section"

export const metadata: Metadata = {
  title: "Pricing | Tahuna",
  description: "Tahuna pricing for managed GPU compute and attached volume.",
  alternates: { canonical: "/pricing" },
}

export default function PricingPage() {
  return (
    <div className="relative h-full overflow-y-auto bg-background">
      <div
        aria-hidden
        className="surface-noise pointer-events-none fixed inset-0 opacity-[0.015] dark:opacity-[0.03]"
      />
      <div className="relative min-h-full">
        <LandingNav />
        <main>
          <LandingPricingSection />
        </main>
        <LandingFooter />
      </div>
    </div>
  )
}
