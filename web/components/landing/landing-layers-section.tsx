import Image from "next/image"

import { DotGrid } from "@/components/landing/section-decorations"
import { Card, CardContent } from "@/components/ui/card"
import { CDN_CONFIG } from "@/config"

const ownershipColumns = [
  {
    title: "You own",
    headline: "Your loop",
    items: ["Traces", "Feedback", "Evals", "Rewards", "Training code", "Model choices"],
    className: "border-b border-border md:border-b-0 md:border-r border-background/40 bg-background/80",
  },
  {
    title: "Tahuna handles",
    headline: "Tahuna path",
    items: ["Sync", "GPUs", "Execution", "Metrics", "Checkpoints", "Artifacts"],
    className: "bg-card/75",
  },
] as const

const loopLightGradientSrc =
  process.env.NODE_ENV === "development"
    ? "/landing/tahuna-hero-gradient-teal-lime.png"
    : `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/tahuna-hero-gradient-teal-lime.png`
const loopDarkGradientSrc =
  process.env.NODE_ENV === "development"
    ? "/landing/tahuna-hero-gradient-dark-teal-lime.png"
    : `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/tahuna-hero-gradient-dark-teal-lime.png`

export function LandingLayersSection() {
  return (
    <section id="layers" className="relative overflow-hidden border-t border-border px-6 py-20 md:px-8 md:py-24">
      <DotGrid className="left-0 top-20 h-64 w-1/3" />
      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-4">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">Ownership model</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            Everything around
            <br />
            the training loop
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-muted-foreground">
            You own the learning loop: traces, evals, reward logic, rollout code, and training recipe. Tahuna handles
            the run lifecycle around it.
          </p>
        </div>

        <Card variant="default" className="relative overflow-hidden border-border bg-card/95 lg:col-span-8">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-45 dark:hidden">
            <Image
              src={loopLightGradientSrc}
              alt=""
              fill
              sizes="70vw"
              className="object-cover object-center"
            />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0 hidden dark:block">
            <Image
              src={loopDarkGradientSrc}
              alt=""
              fill
              sizes="70vw"
              className="object-cover object-center"
            />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-card/55 dark:bg-card/15" />

          <CardContent className="relative p-0">
            <div className="grid md:grid-cols-2">
              {ownershipColumns.map((column) => (
                <div key={column.title} className={column.className}>
                  <div className="p-8">
                    <p className="text-xs uppercase tracking-ui-eyebrow text-muted-foreground">{column.title}</p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{column.headline}</h3>
                    <ul className="mt-5 grid gap-3">
                      {column.items.map((item) => (
                        <li
                          key={item}
                          className="border-b border-border/60 pb-2 text-sm text-foreground last:border-b-0 last:pb-0"
                        >
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
