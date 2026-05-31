"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Braces, CircuitBoard, Fingerprint, Waypoints } from "lucide-react"
import { useEffect, useState } from "react"

import { EnvironmentsScreen, OverviewScreen, RunScreen } from "@/components/landing/hero-screens"
import { DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"
import { CDN_CONFIG } from "@/config"

const FEATURES = [
  {
    icon: Braces,
    title: "Own the recipe",
    body: "Use your own entrypoint, eval harness, reward logic, and training code.",
  },
  {
    icon: CircuitBoard,
    title: "Managed compute",
    body: "Provision GPUs and materialize your workspace without SSH or cluster setup.",
  },
  {
    icon: Fingerprint,
    title: "Pinned evidence",
    body: "Attach code, data, logs, metrics, checkpoints, and artifacts to each run.",
  },
  {
    icon: Waypoints,
    title: "Artifact to serve",
    body: "Promote the model snapshot that performs best on your workflow.",
  },
]

const SLIDES = [
  { label: "Overview", screen: <OverviewScreen /> },
  { label: "Runs", screen: <RunScreen /> },
  { label: "Environments", screen: <EnvironmentsScreen /> },
]

const heroGradientSrc =
  process.env.NODE_ENV === "development"
    ? "/landing/tahuna-hero-gradient.png"
    : `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/tahuna-hero-gradient.png`

export function LandingHero() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setActive((current) => (current + 1) % SLIDES.length), 4500)
    return () => window.clearInterval(id)
  }, [])

  return (
    <section className="relative overflow-hidden px-6 pb-0 pt-24 md:px-8 md:pt-32">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-30">
        <Image
          src={heroGradientSrc}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>
      <DotGrid className="inset-y-0 right-0 w-1/2" />

      {/* Product — anchored to the viewport's right edge; the wrapper clips it
          at the screen edge (right) and at a fixed height (bottom). */}
      <div className="pointer-events-none absolute right-0 top-28 hidden h-[40rem] w-[46vw] overflow-hidden lg:block xl:top-32 xl:h-[44rem]">
        <div
          key={active}
          aria-hidden
          className="absolute left-0 top-0 w-[52rem] animate-in fade-in duration-500 xl:w-[60rem]"
        >
          {SLIDES[active].screen}
        </div>
      </div>

      <div className="relative mx-auto max-w-7xl">
        <div className="max-w-2xl lg:max-w-[44rem]">
          <div>
            <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">
              Not a single intelligent blob
            </p>
            <h1 className="font-serif text-4xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
              Models that improve
              <br />
              <span className="italic">from real usage.</span>
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              Turn product traces, feedback, evals, and rewards into specialized models that fit your workflow, instead
              of paying ever-larger generalists to approximate it.
            </p>

            <div className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-foreground" />
                  <div>
                    <p className="font-medium text-foreground">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>

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

          {/* Product — off-center; clipped on the right + bottom, top-left corner shows */}
          <div className="relative hidden overflow-hidden lg:block">
            <div
              key={active}
              className="absolute left-0 top-0 w-[50rem] animate-in fade-in duration-500 xl:w-[56rem]"
            >
              {SLIDES[active].screen}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
