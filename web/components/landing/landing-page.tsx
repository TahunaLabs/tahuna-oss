import { FrameworksBar } from '@/components/landing/frameworks-bar'
import { LandingHero } from '@/components/landing/landing-hero'
import { LandingNav } from '@/components/landing/landing-nav'
import { ManifestoSection } from '@/components/landing/manifesto-section'

export function LandingPage() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* First screen — nav + hero + frameworks fill exactly the viewport */}
      <div className="flex min-h-full flex-col">
        <LandingNav />
        <LandingHero />
        <FrameworksBar />
      </div>

      {/* Subsequent sections start below the fold */}
      <ManifestoSection />
    </div>
  )
}
