import { Card, CardContent } from "@/components/ui/card"

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
    <section id="layers" className="border-t border-border px-6 py-20 md:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs font-mono uppercase tracking-ui-eyebrow text-muted-foreground">The Layers</p>
            <h2 className="font-serif text-3xl leading-tight tracking-tight text-foreground md:text-4xl">
              Explore
              <br />
              <span className="italic">the</span> core loop
            </h2>
          </div>

          <div className="flex items-center gap-6">
            <p className="max-w-md text-lg font-serif font-medium text-foreground md:text-xl">
              You keep the training loop. Tahuna handles everything around it in four clear steps.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {layers.map((layer) => (
            <Card key={layer.title} variant="default" className="flex min-h-96 flex-col border-border bg-card/95">
              <CardContent className="relative flex h-full flex-1 flex-col p-5">
                <div className="absolute inset-0 opacity-10">
                  <svg className="h-full w-full" viewBox="0 0 400 400" preserveAspectRatio="none">
                    <path d="M0,100 Q100,80 200,100 T400,100" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-foreground" />
                    <path d="M0,140 Q100,120 200,140 T400,140" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-foreground" />
                    <path d="M0,180 Q100,160 200,180 T400,180" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-foreground" />
                    <path d="M0,220 Q100,200 200,220 T400,220" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-foreground" />
                  </svg>
                </div>

                <div className="relative flex flex-1 flex-col">
                  <div className="flex flex-1 flex-col justify-center">
                    <h3 className="mb-3 text-center font-serif text-xl text-foreground">{layer.title}</h3>
                    <p className="text-center text-xs text-muted-foreground">{layer.owner}</p>
                    <p className="mt-4 text-center text-sm leading-relaxed text-foreground/80">{layer.detail}</p>
                  </div>

                  <div className="mt-6 space-y-2 border-t border-border pt-6">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{layer.statA}</span>
                      <span>{layer.statB}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
