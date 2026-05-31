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
  {
    icon: RefreshCw,
    title: "Usage to training",
    body: "Bring traces, feedback, failures, rewards, and evals into your post-training loop.",
  },
  {
    icon: Server,
    title: "Managed GPUs",
    body: "Run that loop on A100s, H100s, and more without building GPU operations.",
  },
  {
    icon: Activity,
    title: "Reproducible signal",
    body: "Tie every run to exact code and data so improvements stay traceable.",
  },
  {
    icon: Rocket,
    title: "Train to serve",
    body: "Promote a trained snapshot when it improves on your workflow.",
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
            <h1 className="font-serif text-4xl leading-[1.1] tracking-tight text-foreground md:text-5xl">
              The future isn&apos;t a single intelligent blob.
              <br />
              <span className="italic">It&apos;s models that improve from real usage.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-xl leading-relaxed text-muted-foreground md:text-2xl">
              Tahuna runs your training code on cloud GPUs today, and is built for production traces, feedback, evals,
              and rewards to become the next run you control.
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
