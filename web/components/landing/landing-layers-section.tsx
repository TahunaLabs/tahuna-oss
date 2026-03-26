import { ChevronLeft, ChevronRight } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const layers = [
  {
    title: "CLI",
    owner: "Go surface",
    detail: "login, init, sync, train, run management",
    statA: "4 commands",
    statB: "Terminal first",
    badge: "ENTRY",
  },
  {
    title: "Control Plane",
    owner: "Convex backend",
    detail: "auth, state, lifecycle orchestration, monitoring",
    statA: "Snapshots pinned",
    statB: "Runs queryable",
    badge: "CORE",
  },
  {
    title: "Runtime",
    owner: "Warden",
    detail: "materialize workspace, install deps, execute, report",
    statA: "One binary",
    statB: "No shell fallback",
    badge: "EXEC",
  },
  {
    title: "Storage + Compute",
    owner: "R2 and RunPod",
    detail: "content-addressed blobs, manifests, artifacts, GPU pods",
    statA: "Incremental sync",
    statB: "Artifacts persisted",
    badge: "INFRA",
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
              <span className="italic">the</span> architecture
            </h2>
          </div>

          <div className="flex items-center gap-6">
            <p className="max-w-md text-lg font-serif text-foreground/80 md:text-xl">
              Full control over the training loop. Low complexity everywhere around it.
            </p>
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="outline" size="icon-control" aria-label="Previous layer">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-control" aria-label="Next layer">
                <ChevronRight />
              </Button>
            </div>
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
                    <div className="flex items-center justify-between">
                      <Badge variant="default">{layer.badge}</Badge>
                      <span className="text-xs text-muted-foreground">Path C</span>
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
