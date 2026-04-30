import { FrameworksBar } from "@/components/landing/frameworks-bar"
import { LandingFooter } from "@/components/landing/landing-footer"
import { LandingFoundersIncBadge } from "@/components/landing/landing-founders-inc-badge"
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
          <div className="flex justify-center px-6 py-6">
            <LandingFoundersIncBadge />
          </div>
          <LandingHero />
          <FrameworksBar />
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
