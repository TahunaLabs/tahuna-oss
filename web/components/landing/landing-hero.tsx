"use client"

import Image from "next/image"
import Link from "next/link"
import { Activity, ArrowRight, RefreshCw, Rocket, Server } from "lucide-react"
import { useEffect, useState } from "react"

import { EnvironmentsScreen, OverviewScreen, RunScreen } from "@/components/landing/hero-screens"
import { DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"
import { CDN_CONFIG } from "@/config"

const FEATURES = [
  { icon: Server, title: "Managed GPUs", body: "Provision A100s, H100s, and more without building GPU operations." },
  { icon: RefreshCw, title: "Pinned snapshots", body: "Push local deltas and tie every run to exact code and data." },
  { icon: Activity, title: "Live telemetry", body: "Stream logs and W&B-compatible metrics while your job runs." },
  { icon: Rocket, title: "Run to serve", body: "Launch a pinned model snapshot behind managed compute." },
]

const SLIDES = [
  { label: "Overview", screen: <OverviewScreen /> },
  { label: "Runs", screen: <RunScreen /> },
  { label: "Environments", screen: <EnvironmentsScreen /> },
]

const heroGradientSrc = `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/tahuna-hero-gradient.png`

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
            <h1 className="font-serif text-4xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
              Own your intelligence
              <br />
              <span className="italic">loop.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-muted-foreground md:text-2xl">
              Run custom training and post-training jobs on cloud GPUs from your terminal. Keep your Python loop;
              Tahuna handles the infrastructure around it.
            </p>

            <div className="mt-10 grid gap-x-10 gap-y-7 sm:grid-cols-2">
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

            <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row">
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
