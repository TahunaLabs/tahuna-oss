import { Eyebrow } from '@/components/ui/eyebrow'
import { TerminalBlock } from '@/components/ui/terminal-block'
import { HeroDecoration } from '@/components/landing/hero-decoration'

export function LandingHero() {
  return (
    <section id="hero" className="flex flex-1 items-center px-8 py-12">
      <div className="grid w-full grid-cols-2 gap-8">
        <div className="flex flex-col justify-center gap-8">
          <Eyebrow variant="cancelling">Vision</Eyebrow>

          <h1 className="font-serif text-6xl font-semibold leading-display-tight text-foreground">
            The gap between
            <br />
            general and yours.
          </h1>

          <div className="flex flex-col gap-4 font-mono text-sm text-muted-foreground leading-relaxed">
            <p>
              CLI-native post-training. For you, or the agents
              <br />
              working alongside you.
            </p>
          </div>

          <TerminalBlock command="curl -fsSL https://app.tahuna.ai/cli | sh" />
        </div>

        <div className="relative">
          <HeroDecoration />
        </div>
      </div>
    </section>
  )
}
