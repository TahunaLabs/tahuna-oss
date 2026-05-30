import { DotGrid } from "@/components/landing/section-decorations"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const layers = [
  {
    title: "Tahuna init",
    owner: "tahuna init",
    detail: "Tahuna scans your project, detects your framework, identifies your entrypoint and data, and scaffolds anything missing.",
    statA: "Project-aware",
    statB: "No boilerplate",
  },
  {
    title: "Align",
    owner: "tahuna sync",
    detail: "Your code and data are synced incrementally. Only changed files travel, and every run is pinned to exact snapshots.",
    statA: "Incremental sync",
    statB: "Delta-only uploads",
  },
  {
    title: "Train",
    owner: "tahuna train",
    detail: "Tahuna provisions the GPU, materializes the workspace, installs dependencies, and runs your training entrypoint.",
    statA: "Logs stream live",
    statB: "Your loop stays yours",
  },
  {
    title: "Serve",
    owner: "tahuna serve",
    detail: "Tahuna provisions inference compute, loads a pinned model snapshot, installs what your service needs, and brings it online.",
    statA: "Inference-ready",
    statB: "Health-checked",
  },
]

export function LandingLayersSection() {
  return (
    <section id="layers" className="relative overflow-hidden border-t border-border px-6 py-24 md:px-8 md:py-32">
      <DotGrid className="left-0 top-20 h-64 w-1/3" />
      <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4 lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">The Layers</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            Explore
            <br />
            the core loop
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-muted-foreground">
            You keep the training loop. Tahuna handles the post-training infrastructure around it in four clear
            steps.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
          {layers.map((layer, index) => (
            <Card
              key={layer.title}
              variant="default"
              className={cn(
                "flex flex-col border-border bg-card/95",
                index % 2 === 1 && "sm:mt-12",
              )}
            >
              <CardContent className="flex h-full flex-1 flex-col p-6">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">{layer.owner}</span>
                  <span className="text-2xl tabular-nums text-muted-foreground/30">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>

                <h3 className="mt-5 text-xl font-semibold text-foreground">{layer.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/80">{layer.detail}</p>

                <div className="mt-auto flex items-center justify-between border-t border-border pt-5 text-xs text-muted-foreground">
                  <span>{layer.statA}</span>
                  <span>{layer.statB}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
