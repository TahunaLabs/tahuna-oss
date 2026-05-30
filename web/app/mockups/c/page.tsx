import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { HeroDecoration } from "@/components/landing/hero-decoration"
import { LandingNav } from "@/components/landing/landing-nav"
import { DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"

// Mockup C — SPLIT / FULL-BLEED PRODUCT: 50/50, product dominates the right half.
export default function MockupSplit() {
  return (
    <div className="relative h-full overflow-hidden bg-background">
      <div className="flex h-full flex-col">
        <LandingNav />
        <main className="grid flex-1 lg:grid-cols-2">
          <div className="flex flex-col justify-center px-6 py-16 md:px-12 lg:px-16">
            <p className="mb-4 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">
              Post-training control plane
            </p>
            <h1 className="max-w-md font-serif text-4xl leading-display-tight tracking-tight text-foreground md:text-6xl">
              A gentle control plane for post-training.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
              You keep the training loop. Tahuna handles provisioning, sync, dependencies, and live metrics —
              so you focus on the model, not the infra.
            </p>
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
          </div>

          <div className="relative hidden overflow-hidden border-l border-border bg-muted/30 lg:block">
            <DotGrid className="inset-0" />
            <div className="absolute left-16 top-24 w-[34rem]">
              <HeroDecoration />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
