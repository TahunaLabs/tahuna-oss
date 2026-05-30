import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { LandingNav } from "@/components/landing/landing-nav"
import { DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"
import { StatusDot } from "@/components/ui/status-dot"

// Mockup B — AIRY / EDITORIAL: confident, sparse, one product hint, lots of air.
export default function MockupAiry() {
  return (
    <div className="relative h-full overflow-y-auto bg-background">
      <div
        aria-hidden
        className="surface-noise pointer-events-none fixed inset-0 opacity-[0.015] dark:opacity-[0.03]"
      />
      <div className="relative min-h-full">
        <LandingNav />
        <main className="relative overflow-hidden">
          <DotGrid className="inset-x-0 top-0 h-[80vh] opacity-60" />
          <div className="relative mx-auto flex min-h-[82vh] max-w-3xl flex-col items-center justify-center px-6 text-center">
            <p className="mb-6 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">
              A gentle control plane
            </p>
            <h1 className="font-serif text-5xl leading-display-tight tracking-tight text-foreground md:text-7xl">
              The future is billions of
              <br />
              <span className="italic">species of models.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Post-training infrastructure that keeps your loop intact. No research lab required.
            </p>

            <Button asChild size="lg" className="mt-10">
              <Link href="/login">
                Get started
                <ArrowRight />
              </Link>
            </Button>

            <div className="mt-24 inline-flex items-center gap-2 border border-border bg-card px-3 py-1.5 text-ui-caption text-foreground">
              <StatusDot variant="running" size="xs" />
              minimax-2.5 · loss 2.41 → 0.94
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
