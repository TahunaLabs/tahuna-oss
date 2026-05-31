"use client"

import Link from "next/link"
import { Activity, ArrowRight, RefreshCw, Rocket, Server } from "lucide-react"
import { useEffect, useState } from "react"

import { EnvironmentsScreen, OverviewScreen, RunScreen } from "@/components/landing/hero-screens"
import { DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const FEATURES = [
  { icon: Server, title: "Managed GPUs", body: "Provision H100s, A100s, and more — no infrastructure to wire up." },
  { icon: RefreshCw, title: "Incremental sync", body: "Only changed files travel; every run pins to an exact snapshot." },
  { icon: Activity, title: "Live metrics", body: "Stream W&B-compatible loss and throughput as you train." },
  { icon: Rocket, title: "One-command serve", body: "Promote a checkpoint to an inference endpoint in a single step." },
]

const SLIDES = [
  { label: "Overview", screen: <OverviewScreen /> },
  { label: "Runs", screen: <RunScreen /> },
  { label: "Environments", screen: <EnvironmentsScreen /> },
]

export function LandingHero() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => setActive((current) => (current + 1) % SLIDES.length), 4500)
    return () => window.clearInterval(id)
  }, [])

  return (
    <section className="relative overflow-hidden px-6 py-20 md:px-8 md:py-24">
      <DotGrid className="inset-y-0 right-0 w-1/2" />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid items-stretch gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <h1 className="font-serif text-4xl leading-display-tight tracking-tight text-foreground md:text-5xl">
              The future is not a single intelligent blob.
              <br />
              <span className="italic">It&apos;s billions of species of models.</span>
            </h1>

            <p className="mt-6 max-w-lg text-xl leading-snug text-muted-foreground md:text-2xl">
              Post-training infrastructure should be easily accessible — a wide field of specialized systems, not
              one monolith.
            </p>

            <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
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

          <div className="relative hidden lg:block">
            <div
              key={active}
              className="absolute inset-y-0 left-0 right-[-6rem] animate-in fade-in duration-500 xl:right-[-10rem]"
            >
              {SLIDES[active].screen}
            </div>
          </div>
        </div>

        <div className="mt-14 hidden items-center justify-center gap-4 lg:flex">
          <div className="flex items-center gap-1.5">
            {SLIDES.map((slide, index) => (
              <button
                key={slide.label}
                type="button"
                aria-label={`Show ${slide.label}`}
                onClick={() => setActive(index)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === active ? "w-6 bg-foreground" : "w-1.5 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
          <span className="text-ui-caption text-muted-foreground">
            {active + 1} of {SLIDES.length} — {SLIDES[active].label}
          </span>
        </div>
      </div>
    </section>
  )
}
