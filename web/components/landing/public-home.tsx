import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingHero } from "@/components/landing/landing-hero"
import { LandingNav } from "@/components/landing/landing-nav"
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
          <LandingTerminalSection />
        </main>
        <LandingFooter />
      </div>
    </div>
  )
}
