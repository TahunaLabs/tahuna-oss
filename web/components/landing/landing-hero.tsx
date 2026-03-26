import { Eyebrow } from '@/components/ui/eyebrow'
import { TerminalBlock } from '@/components/ui/terminal-block'
import { HeroDecoration } from '@/components/landing/hero-decoration'

export function LandingHero() {
  return (
    <section id="hero" className="flex flex-1 items-start px-8 py-12">
      <div className="grid w-full grid-cols-2 gap-8">
        <div className="flex flex-col justify-center gap-8">
          <Eyebrow variant="cancelling">Vision</Eyebrow>

          <h1 className="font-serif text-6xl font-semibold leading-display-tight text-foreground">
            Fine-tune Models
            <br />
            Without the Ops
          </h1>

          <div className="flex flex-col gap-4 font-mono text-sm text-muted-foreground leading-relaxed">
            <p>
              The only fine-tuning platform
              <br />
              that works everywhere you do.
            </p>
            <p>
              From data prep to deployment — run experiments,
              <br />
              track metrics, and ship adapters without
              <br />
              changing your tools, models, or workflow.
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
