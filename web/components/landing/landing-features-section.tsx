import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"
import { StatusDot } from "@/components/ui/status-dot"
import { cn } from "@/lib/utils"

const float = "shadow-[0_24px_60px_-30px_rgba(0,0,0,0.4)]"

function WindowBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
      <div className="flex gap-1.5">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
      </div>
      <span className="ml-1 text-ui-caption text-muted-foreground">{title}</span>
      {right ? <span className="ml-auto">{right}</span> : null}
    </div>
  )
}

const lossCurve = [96, 90, 84, 79, 81, 72, 67, 63, 65, 56, 52, 49, 44, 46, 38, 34, 31, 27, 24, 19]

function MetricsVisual() {
  return (
    <Card variant="default" className={cn("bg-card", float)}>
      <WindowBar
        title="run · minimax-2.5"
        right={
          <span className="flex items-center gap-1.5">
            <StatusDot variant="running" size="xs" />
            <span className="text-ui-micro text-muted-foreground">epoch 3/8</span>
          </span>
        }
      />
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        {[
          { label: "loss", value: "0.94" },
          { label: "throughput", value: "1.2k tok/s" },
          { label: "step", value: "2,310" },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-3">
            <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-ui-caption text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="px-4 py-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">train/loss</span>
          <span className="text-ui-caption text-foreground">2.41 → 0.94</span>
        </div>
        <div className="flex h-24 items-end gap-0.5 border-b border-border pb-px">
          {lossCurve.map((height, index) => (
            <span key={index} className="flex-1 bg-foreground/30" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </Card>
  )
}

const envRows = [
  { name: "mnist", device: "RTX 3090 ×1", runtime: "pt2.2-cu121", status: "completed" },
  { name: "qwen3-coder", device: "A100 ×4", runtime: "pt2.10-cu128", status: "running" },
  { name: "llama-rl", device: "B200 ×2", runtime: "pt2.11-cu130", status: "queued" },
]

function EnvironmentsVisual() {
  return (
    <Card variant="default" className={cn("bg-card", float)}>
      <WindowBar title="tahuna · environments" />
      <div className="grid grid-cols-[1.4fr_1.1fr_1.1fr] gap-3 border-b border-border px-4 py-2 text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">
        <span>Name</span>
        <span>Device</span>
        <span>Runtime</span>
      </div>
      <div className="divide-y divide-border">
        {envRows.map((row) => (
          <div key={row.name} className="grid grid-cols-[1.4fr_1.1fr_1.1fr] items-center gap-3 px-4 py-2.5">
            <span className="flex items-center gap-1.5 truncate text-ui-caption text-foreground">
              <StatusDot variant={row.status === "running" ? "running" : row.status === "queued" ? "queued" : "completed"} size="xs" />
              {row.name}
            </span>
            <span className="text-ui-micro text-muted-foreground">{row.device}</span>
            <span className="text-ui-micro text-muted-foreground">{row.runtime}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ServeVisual() {
  return (
    <Card variant="default" className={cn("bg-card", float)}>
      <WindowBar
        title="serve · minimax-2.5"
        right={
          <span className="flex items-center gap-1.5">
            <StatusDot variant="running" size="xs" />
            <span className="text-ui-micro text-muted-foreground">online</span>
          </span>
        }
      />
      <div className="space-y-3 px-4 py-4">
        <div className="rounded border border-border bg-muted/40 px-3 py-2 text-ui-caption text-foreground/85">
          POST https://api.tahuna.app/v1/minimax-2.5/generate
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">latency p50</p>
            <p className="mt-1 text-ui-caption text-foreground">142 ms</p>
          </div>
          <div>
            <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">requests</p>
            <p className="mt-1 text-ui-caption text-foreground">38.4k</p>
          </div>
        </div>
      </div>
    </Card>
  )
}

const features = [
  {
    eyebrow: "Train",
    title: "Watch training as it happens",
    body: "Provision GPUs, materialize your workspace, and stream Weights & Biases-compatible metrics live — no dashboards to wire up.",
    bullets: ["Live loss & throughput", "Logs stream as they happen", "Your loop stays yours"],
    visual: <MetricsVisual />,
  },
  {
    eyebrow: "Sync",
    title: "Environments, versioned and shareable",
    body: "Each environment pins your code, data, device, and runtime. Only changed files travel, and every run snapshots to an exact state.",
    bullets: ["Incremental, delta-only sync", "Pinned runtimes per environment", "Private by default"],
    visual: <EnvironmentsVisual />,
  },
  {
    eyebrow: "Serve",
    title: "Serve a checkpoint in one command",
    body: "Promote a trained snapshot to an inference endpoint. Tahuna provisions compute, loads the model, and brings it online.",
    bullets: ["One command from run to endpoint", "Health-checked, autoscaled", "OpenAI-compatible API"],
    visual: <ServeVisual />,
  },
]

export function LandingFeaturesSection() {
  return (
    <section id="product" className="border-t border-border px-6 py-24 md:px-8 md:py-32">
      <div className="mx-auto max-w-7xl">
        <div className="mb-16 max-w-2xl">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">The product</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            Everything around your training loop
          </h2>
        </div>

        <div className="space-y-20 lg:space-y-28">
          {features.map((feature, index) => {
            const flip = index % 2 === 1
            return (
              <div key={feature.title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className={cn(flip && "lg:order-2")}>
                  <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">{feature.eyebrow}</p>
                  <h3 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{feature.title}</h3>
                  <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">{feature.body}</p>
                  <ul className="mt-6 space-y-2">
                    {feature.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-center gap-2 text-sm text-foreground/85">
                        <span className="h-1 w-1 rounded-full bg-foreground/50" />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={cn(flip && "lg:order-1")}>{feature.visual}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
