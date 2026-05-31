import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"

const runRows = [
  { name: "minimax-2.5", status: "running", runtime: "4m 27s" },
  { name: "mellow-forest-wolf", status: "completed", runtime: "8m 47s" },
  { name: "rapid-meadow-tiger", status: "failed", runtime: "—" },
  { name: "drift-harbor-yak", status: "completed", runtime: "10m 28s" },
]

const detailStats = [
  { label: "loss", value: "0.94" },
  { label: "throughput", value: "1.2k tok/s" },
  { label: "step", value: "2,310" },
]

const lossCurve = [96, 88, 82, 74, 77, 66, 61, 57, 60, 49, 45, 41, 36, 38, 30, 25]
const gradCurve = [40, 58, 44, 62, 50, 70, 48, 66, 52, 60, 46, 64, 50, 58, 44, 56]

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

function Sparkline({ points }: { points: number[] }) {
  return (
    <div className="flex h-10 items-end gap-px">
      {points.map((height, index) => (
        <span key={index} className="flex-1 bg-foreground/25" style={{ height: `${height}%` }} />
      ))}
    </div>
  )
}

export function HeroDecoration() {
  return (
    <div className="relative h-[30rem] w-full select-none" aria-hidden>
      {/* Shared stage — a darker panel the windows sit on, cropped off the right edge */}
      <div className="absolute inset-y-0 left-4 right-[-6rem] rounded-lg border border-border bg-muted/20" />

      {/* Back window — runs list, peeking behind, bleeds right */}
      <Card variant="default" className="absolute right-[-3rem] top-6 z-10 w-[24rem] max-w-none bg-card">
        <WindowBar title="tahuna · runs" />
        <div className="grid grid-cols-[1.6fr_1fr_0.8fr] gap-3 border-b border-border px-4 py-2 text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">
          <span>Run</span>
          <span>Status</span>
          <span className="text-right">Runtime</span>
        </div>
        <div className="divide-y divide-border">
          {runRows.map((row) => (
            <div key={row.name} className="grid grid-cols-[1.6fr_1fr_0.8fr] items-center gap-3 px-4 py-2.5">
              <span className="truncate text-ui-caption text-foreground">{row.name}</span>
              <span className="flex items-center gap-1.5">
                <StatusDot variant={toStatusDotVariant(row.status)} size="xs" />
                <span className="text-ui-micro capitalize text-muted-foreground">{row.status}</span>
              </span>
              <span className="text-right text-ui-micro text-muted-foreground">{row.runtime}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Front window — the live run, overlapping lower-left (the focal surface) */}
      <Card variant="default" className="absolute left-0 top-28 z-20 w-[27rem] max-w-none bg-card">
        <WindowBar
          title="run · minimax-2.5"
          right={
            <span className="flex items-center gap-1.5">
              <StatusDot variant="running" size="xs" />
              <span className="text-ui-micro text-muted-foreground">running · epoch 3/8</span>
            </span>
          }
        />
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          {detailStats.map((stat) => (
            <div key={stat.label} className="px-4 py-3">
              <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-ui-caption text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 p-4">
          <div>
            <p className="mb-1.5 text-ui-micro text-muted-foreground">train/loss</p>
            <Sparkline points={lossCurve} />
          </div>
          <div>
            <p className="mb-1.5 text-ui-micro text-muted-foreground">train/grad_norm</p>
            <Sparkline points={gradCurve} />
          </div>
        </div>
      </Card>

      {/* Floating accent — the launching command */}
      <Card variant="default" className="absolute bottom-6 right-2 z-30 w-56 bg-card">
        <WindowBar title="tahuna train" />
        <div className="flex flex-col gap-1.5 px-3 py-2.5 text-ui-caption">
          <span className="text-foreground/85">&gt; $ tahuna train</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <StatusDot variant="running" size="xs" />
            streaming metrics
          </span>
        </div>
      </Card>
    </div>
  )
}
