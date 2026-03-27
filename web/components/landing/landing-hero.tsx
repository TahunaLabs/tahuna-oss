import { Eyebrow } from '@/components/ui/eyebrow'
import { TerminalBlock } from '@/components/ui/terminal-block'
import { HeroDecoration } from '@/components/landing/hero-decoration'

export function LandingHero() {
  return (
    <section id="hero" className="flex flex-1 items-center px-8 py-6">
      <div className="grid w-full grid-cols-5 gap-8">
        <div className="col-span-3 flex flex-col justify-center gap-8">
          <Eyebrow>Vision</Eyebrow>

          <h1 className="font-serif text-7xl font-semibold leading-display-tight text-foreground">
            The gap between general and yours.
          </h1>

          <div className="flex flex-col gap-4 font-mono text-sm text-muted-foreground leading-relaxed">
            <p>
              CLI-native post-training. For you, or the agents working alongside you.
            </p>
          </div>

          <TerminalBlock command="curl -fsSL https://app.tahuna.ai/cli | sh" />
        </div>

        <div className="col-span-2 relative">
          <HeroDecoration />
        </div>
      </div>
    </section>
  )
}
