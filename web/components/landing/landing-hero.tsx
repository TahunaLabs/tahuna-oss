"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"

import { HeroProduct } from "@/components/landing/hero-product"
import { EnvironmentsScreen, OverviewScreen, RunScreen, RunsScreen } from "@/components/landing/hero-screens"
import { DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"
import { CLOUD_LINKS_CONFIG } from "@/cloud/links"
import { CDN_CONFIG } from "@/config"

const SLIDES = [<OverviewScreen />, <RunsScreen />, <RunScreen />, <EnvironmentsScreen />]

const heroLightGradientSrc = `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/${CDN_CONFIG.heroGradientLight}`
const heroDarkGradientSrc = `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/${CDN_CONFIG.heroGradientDark}`

export function LandingHero() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setActive((current) => (current + 1) % SLIDES.length), 4500)
    return () => window.clearInterval(id)
  }, [])

  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-24 md:px-8 md:pb-32 md:pt-32 lg:pb-0">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70 dark:hidden">
        <Image src={heroLightGradientSrc} alt="" fill fetchPriority="high" sizes="100vw" className="object-cover object-center" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block">
        <Image src={heroDarkGradientSrc} alt="" fill fetchPriority="high" sizes="100vw" className="object-cover object-center" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-7/12 bg-gradient-to-r from-background via-background/80 to-transparent dark:w-5/12 dark:via-background/10"
      />
      <DotGrid className="inset-y-0 right-0 w-1/2" />

      {/* Two-track layout: the text flexes to fill, the product keeps its fixed
          width at the content-area's right edge. The product is the tallest
          element, so it defines the section height and its bottom lines up with
          the background. No viewport math, no reserved gutters. */}
      <div className="relative mx-auto flex max-w-7xl flex-col gap-12 lg:flex-row lg:items-stretch">
        <div className="flex min-w-0 max-w-2xl flex-1 flex-col justify-center lg:max-w-none">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">
            Open-source compute infrastructure
          </p>
          <h1 className="font-serif text-3xl tracking-tight text-foreground md:text-4xl">
            <span className="lg:block">Run your ML workloads </span>{" "}
            <span className="italic lg:block lg:whitespace-nowrap">on remote GPUs.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Tahuna syncs your project, starts the GPU, runs your Python entrypoint, streams the output, saves the
            artifacts, and shuts the machine down.
          </p>

          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
            <Button asChild variant="default" size="lg">
              <Link href={`${CLOUD_LINKS_CONFIG.repoUrl}#5-run-the-mnist-example`} target="_blank" rel="noreferrer">
                Run the MNIST example
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href={CLOUD_LINKS_CONFIG.repoUrl} target="_blank" rel="noreferrer">
                View on GitHub
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>

        <HeroProduct slideKey={active}>{SLIDES[active]}</HeroProduct>
      </div>
    </section>
  )
}
