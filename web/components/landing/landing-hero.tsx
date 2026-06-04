"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"

import { EnvironmentsScreen, MetricsScreen, OverviewScreen, RunScreen } from "@/components/landing/hero-screens"
import { DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"
import { CDN_CONFIG } from "@/config"

const SLIDES = [
  { label: "Metrics", screen: <MetricsScreen /> },
  { label: "Overview", screen: <OverviewScreen /> },
  { label: "Runs", screen: <RunScreen /> },
  { label: "Environments", screen: <EnvironmentsScreen /> },
]

const heroLightGradientSrc = `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/${CDN_CONFIG.heroGradientLight}`
const heroDarkGradientSrc = `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/${CDN_CONFIG.heroGradientDark}`

export function LandingHero() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setActive((current) => (current + 1) % SLIDES.length), 4500)
    return () => window.clearInterval(id)
  }, [])

  return (
    <section className="relative overflow-hidden px-6 pb-48 pt-24 md:px-8 md:pb-96 md:pt-32">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70 dark:hidden">
        <Image
          src={heroLightGradientSrc}
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block">
        <Image
          src={heroDarkGradientSrc}
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[58%] bg-gradient-to-r from-background via-background/80 to-transparent dark:w-[44%] dark:via-background/10"
      />
      <DotGrid className="inset-y-0 right-0 w-1/2" />

      {/* Product — anchored to the viewport's right edge and the section's
          bottom edge (so its bottom lines up with the background). The wrapper
          is a fixed-width (rem) clip window, not viewport-relative, so the
          right-edge crop stays consistent at every screen size. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 top-28 hidden w-[39.5rem] overflow-hidden lg:block xl:top-32 xl:w-[47rem]">
        <div
          key={active}
          aria-hidden
          className="absolute bottom-0 left-0 w-[44rem] animate-in fade-in duration-500 xl:w-[52rem]"
        >
          {SLIDES[active].screen}
        </div>
      </div>

      <div className="relative">
        {/* Text fills from the max-w-7xl left grid line out to the screenshot's
            left edge, so it grows with the viewport instead of leaving a void.
            Left inset matches the centered max-w-7xl sections; right inset
            reserves the screenshot's width (kept in sync with the clip window
            above) plus a small gap. */}
        <div className="max-w-2xl lg:max-w-none lg:pl-[max(0px,calc(50vw_-_42rem))] lg:pr-[42.5rem] xl:pr-[50rem]">
          <div>
            <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">
              Infrastructure for adaptive AI systems
            </p>
            <h1 className="font-serif text-3xl leading-[1.1] tracking-tight text-foreground md:text-4xl">
              Own the intelligence loop{" "}
              <span className="italic">behind your AI systems.</span>
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Move from one-off model work to a controlled improvement loop: train, serve, hillclimb, and observe.
            </p>

            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
              <Button asChild variant="default" size="lg">
                <Link href="/login">
                  Start building
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
        </div>
      </div>
    </section>
  )
}
