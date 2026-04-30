import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { LandingFoundersIncBadge } from "@/components/landing/landing-founders-inc-badge"
import { Button } from "@/components/ui/button"

export function LandingHero() {
  return (
    <section className="relative overflow-hidden px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-5xl">
          <h1 className="mb-10 font-serif text-4xl leading-display-tight tracking-tight text-foreground md:text-6xl xl:text-6xl">
            The future is not a single intelligent blob.
            <br />
            <span className="italic">It&apos;s billions of species of models.</span>
          </h1>

          <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <p className="text-lg leading-relaxed text-foreground/85 md:text-xl">
                The future of artificial intelligence is a wide field of specialized systems. Post-training
                infrastructure should be easily accessible.
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 self-start">
              <Button
                asChild
                variant="default"
                size="compact"
                className="font-serif text-base uppercase tracking-tight"
              >
                <Link href="/login">
                  Get started
                  <ArrowRight />
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="compact"
                className="font-serif text-base uppercase tracking-tight"
              >
                <Link href="https://cal.com/monaimel/15min" target="_blank" rel="noreferrer">
                  Talk to an engineer
                  <ArrowRight />
                </Link>
              </Button>

              <LandingFoundersIncBadge />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
