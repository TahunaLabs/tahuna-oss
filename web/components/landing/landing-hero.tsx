import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { HeroDecoration } from "@/components/landing/hero-decoration"
import { DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"

const HIGHLIGHTS = [
  "Train, fine-tune, and run RL on managed GPUs",
  "Keep your training loop — Tahuna handles the infra",
  "Live metrics and versioned, shareable environments",
]

export function LandingHero() {
  return (
    <section className="relative overflow-hidden px-6 py-20 md:px-8 md:py-24">
      <DotGrid className="inset-y-0 right-0 w-1/2" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
        <div className="max-w-xl">
          <h1 className="font-serif text-4xl leading-display-tight tracking-tight text-foreground md:text-5xl">
            The future is not a single intelligent blob.
            <br />
            <span className="italic">It&apos;s billions of species of models.</span>
          </h1>

          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
            Post-training infrastructure should be easily accessible — a wide field of specialized systems, not
            one monolith.
          </p>

          <ul className="mt-7 space-y-2.5">
            {HIGHLIGHTS.map((highlight) => (
              <li key={highlight} className="flex items-center gap-2.5 text-sm text-foreground/85">
                <span className="h-1 w-1 shrink-0 rounded-full bg-foreground/50" />
                {highlight}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
            <Button asChild variant="default" size="lg">
              <Link href="/login">
                Get started
                <ArrowRight />
              </Link>
            </Button>

            <Button asChild variant="outline" size="lg">
              <Link href="https://cal.com/monaimel/15min" target="_blank" rel="noreferrer">
                Talk to an engineer
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative hidden lg:block">
          <HeroDecoration />
        </div>
      </div>
    </section>
  )
}
