import { FrameworksBar } from "@/components/landing/frameworks-bar"
import { LandingCtaSection } from "@/components/landing/landing-cta-section"
import { LandingFaqSection } from "@/components/landing/landing-faq-section"
import { LandingFeaturesSection } from "@/components/landing/landing-features-section"
import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingHero } from "@/components/landing/landing-hero"
import { LandingLayersSection } from "@/components/landing/landing-layers-section"
import { LandingNav } from "@/components/landing/landing-nav"
import { LandingPricingSection } from "@/components/landing/landing-pricing-section"
import { LandingTerminalSection } from "@/components/landing/landing-terminal-section"

export function PublicHome() {
  return (
    <div className="relative h-full overflow-y-auto bg-background">
      <div
        aria-hidden
        className="surface-noise pointer-events-none fixed inset-0 opacity-[0.015] dark:opacity-[0.03]"
      />
      <div className="relative min-h-full">
        <LandingNav />
        <main>
          <LandingHero />
          <FrameworksBar />
          <LandingTerminalSection />
          <LandingLayersSection />
          <LandingFeaturesSection />
          <LandingPricingSection />
          <LandingFaqSection />
          <LandingCtaSection />
        </main>
        <LandingFooter />
      </div>
    </div>
  )
}
