import Image from "next/image"

import { DotGrid } from "@/components/landing/section-decorations"
import { Card, CardContent } from "@/components/ui/card"
import { CDN_CONFIG } from "@/config"

const ownershipColumns = [
  {
    title: "You own",
    headline: "Your project",
    items: ["Python entrypoint", "Dependencies", "Data", "Models", "Training logic", "Output files"],
    className: "border-b border-border md:border-b-0 md:border-r border-background/40 bg-background/80",
  },
  {
    title: "Tahuna handles",
    headline: "Run infrastructure",
    items: ["Synchronization", "Environment reconstruction", "GPU provisioning", "Execution", "Logs and metrics", "Artifacts and cleanup"],
    className: "bg-card/75",
  },
] as const

const loopLightGradientSrc = `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/${CDN_CONFIG.heroGradientLight}`
const loopDarkGradientSrc = `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/${CDN_CONFIG.heroGradientDark}`

export function LandingLayersSection() {
  return (
    <section id="layers" className="relative overflow-hidden border-t border-border px-6 py-20 md:px-8 md:py-24">
      <DotGrid className="left-0 top-20 h-64 w-1/3" />
      <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-4">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">Ownership</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            Your code
            <br />stays yours
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-muted-foreground">
            Tahuna runs the infrastructure around your workload without replacing your training code, framework, or
            model choices.
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
