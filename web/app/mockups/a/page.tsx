import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { HeroDecoration } from "@/components/landing/hero-decoration"
import { LandingNav } from "@/components/landing/landing-nav"
import { Crosshair } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"

// Mockup A — DENSE / TECHNICAL: product-forward, framed, blueprint feel.
export default function MockupDense() {
  return (
    <div className="relative h-full overflow-y-auto bg-background">
      <div
        aria-hidden
        className="surface-noise pointer-events-none fixed inset-0 opacity-[0.015] dark:opacity-[0.03]"
      />
      <div className="relative min-h-full">
        <LandingNav />
        <main className="relative overflow-hidden px-6 py-20 md:px-8 md:py-24">
          <Crosshair className="left-8 top-10 hidden lg:block" />
          <Crosshair className="right-8 top-10 hidden lg:block" />
          <div className="mx-auto max-w-7xl">
            <p className="mb-4 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">
              Post-training control plane
            </p>
            <h1 className="max-w-4xl font-serif text-4xl leading-display-tight tracking-tight text-foreground md:text-6xl">
              Train, fine-tune, and serve
              <br />
              <span className="italic">without the DevOps.</span>
            </h1>

            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/login">
                  Get started
                  <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/login">
                  Talk to an engineer
                  <ArrowRight />
                </Link>
              </Button>
            </div>

            <div className="relative mt-20 border border-border bg-muted/20 px-8 pb-8 pt-16 lg:px-16">
              <Crosshair className="-left-1.5 -top-1.5" />
              <Crosshair className="-right-1.5 -top-1.5" />
              <Crosshair className="-bottom-1.5 -left-1.5" />
              <Crosshair className="-bottom-1.5 -right-1.5" />
              <span className="absolute left-8 top-5 text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground lg:left-16">
                live run
              </span>
              <HeroDecoration />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
