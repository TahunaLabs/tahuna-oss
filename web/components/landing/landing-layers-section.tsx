import { DotGrid } from "@/components/landing/section-decorations"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const layers = [
  {
    title: "Tahuna init",
    owner: "tahuna init",
    detail: "Detect the project, framework, entrypoint, data, and environment, then scaffold the missing config.",
    statA: "Project-aware",
    statB: "Config scaffolded",
  },
  {
    title: "Align",
    owner: "tahuna sync",
    detail: "Upload changed files and pin code/data manifests so each run stays tied to the inputs that produced it.",
    statA: "Manifest pinned",
    statB: "Delta uploads",
  },
  {
    title: "Train",
    owner: "tahuna train",
    detail: "Provision GPUs, materialize the workspace, install dependencies, and execute your configured Python entrypoint.",
    statA: "GPU-backed",
    statB: "Your script runs",
  },
  {
    title: "Serve",
    owner: "tahuna serve",
    detail: "Provision inference compute, load a pinned model snapshot, install service dependencies, and proxy authenticated traffic.",
    statA: "Pinned snapshot",
    statB: "Authenticated proxy",
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
            Everything around
            <br />
            the training loop
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-muted-foreground">
            You own the algorithm, reward logic, rollout code, and data. Tahuna owns provisioning, sync, execution,
            monitoring, checkpoints, and artifacts.
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
