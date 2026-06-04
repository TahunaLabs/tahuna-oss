import { FrameworksBar } from "@/components/landing/frameworks-bar"
import { LandingCapabilitiesSection } from "@/components/landing/landing-capabilities-section"
import { LandingCtaSection } from "@/components/landing/landing-cta-section"
import { LandingFaqSection } from "@/components/landing/landing-faq-section"
import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingHero } from "@/components/landing/landing-hero"
import { LandingLayersSection } from "@/components/landing/landing-layers-section"
import { LandingNav } from "@/components/landing/landing-nav"
import { LandingTerminalSection } from "@/components/landing/landing-terminal-section"
import { LandingWhySection } from "@/components/landing/landing-why-section"

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
          <LandingCapabilitiesSection />
          <FrameworksBar />
          <LandingWhySection />
          <LandingTerminalSection />
          <LandingLayersSection />
          <LandingFaqSection />
          <LandingCtaSection />
        </main>
        <LandingFooter />
      </div>
    </div>
  )
}
