import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { HeroDecoration } from "@/components/landing/hero-decoration"
import { Crosshair, DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"

export function LandingHero() {
  return (
    <section className="relative overflow-hidden px-6 py-24 md:px-8 md:py-32">
      <DotGrid className="inset-y-0 right-0 w-2/5" />
      <Crosshair className="right-10 top-12 hidden lg:block" />
      <div className="relative mx-auto max-w-7xl">
        <h1 className="mb-10 max-w-4xl font-serif text-4xl leading-display-tight tracking-tight text-foreground md:text-6xl xl:text-6xl">
          The future is not a single intelligent blob.
          <br />
          <span className="italic">It&apos;s billions of species of models.</span>
        </h1>

        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <p className="max-w-xl text-lg leading-relaxed text-foreground/85 md:text-xl">
              The future of artificial intelligence is a wide field of specialized systems. Post-training
              infrastructure should be easily accessible.
            </p>

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
      </div>
    </section>
  )
}
