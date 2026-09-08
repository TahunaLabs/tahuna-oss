import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Crosshair, DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"
import { CLOUD_LINKS_CONFIG } from "@/cloud/links"

export function LandingCtaSection() {
  return (
    <section className="relative overflow-hidden border-t border-border px-6 py-24 md:px-8 md:py-32">
      <DotGrid className="inset-x-0 top-0 h-full opacity-70" />
      <Crosshair className="left-10 top-10 hidden lg:block" />
      <Crosshair className="bottom-10 right-10 hidden lg:block" />
      <div className="relative mx-auto max-w-3xl text-center">
        <p className="mb-4 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">Get started</p>
        <h2 className="text-4xl font-semibold leading-display-tight tracking-tight text-foreground md:text-5xl">
          Run your first
          <br />GPU job
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Bring a Python project. Tahuna handles the path from your machine to a remote GPU and shuts it down when the
          work is done.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href={CLOUD_LINKS_CONFIG.quickstartUrl} target="_blank" rel="noreferrer">
              Open the quickstart
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={CLOUD_LINKS_CONFIG.repoUrl} target="_blank" rel="noreferrer">
              View the source
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
