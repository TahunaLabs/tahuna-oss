import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingHero } from "@/components/landing/landing-hero"
import { LandingLayersSection } from "@/components/landing/landing-layers-section"
import { LandingNav } from "@/components/landing/landing-nav"
import { LandingTerminalSection } from "@/components/landing/landing-terminal-section"

export function PublicHome() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="min-h-full bg-background/70 backdrop-blur-sm">
        <LandingNav />
        <main>
          <LandingHero />
          <LandingTerminalSection />
          <div className="relative">
            <div className="absolute inset-0 bg-background/75" />
            <div className="relative">
              <LandingLayersSection />
            </div>
          </div>
        </main>
        <LandingFooter />
      </div>
    </div>
  )
}
