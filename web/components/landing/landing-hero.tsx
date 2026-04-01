import Link from "next/link"
import { ArrowRight } from "lucide-react"

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
                The future of artificial intelligence is a wide field of specialized systems. Training them should be
                easily accessible.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 self-start">
              <Button
                asChild
                variant="default"
                size="none"
                className="h-12 rounded-none px-6 font-mono text-sm uppercase tracking-ui-eyebrow"
              >
                <Link href="/login">
                  Get started
                  <ArrowRight />
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="none"
                className="h-12 rounded-none border-border bg-background px-6 font-mono text-sm uppercase tracking-ui-eyebrow"
              >
                <Link href="https://cal.com/monaimel/15min" target="_blank" rel="noreferrer">
                  Talk to an engineer
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
