import type { ReactNode } from "react"
import { Maximize2, MoreHorizontal } from "lucide-react"

import { Card } from "@/components/ui/card"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"
import { cn } from "@/lib/utils"

// Localized depth: Mono disables theme shadows globally, so the illustration opts
// back in with explicit shadows to make the windows float and stack in space.
const float = "shadow-[0_28px_70px_-30px_rgba(0,0,0,0.45)]"

const runRows = [
  { name: "minimax-2.5", status: "running", runtime: "4m 27s" },
  { name: "mellow-forest-wolf", status: "completed", runtime: "8m 47s" },
  { name: "rapid-meadow-tiger", status: "failed", runtime: "—" },
  { name: "drift-harbor-yak", status: "completed", runtime: "10m 28s" },
  { name: "calm-summit-owl", status: "completed", runtime: "6m 12s" },
  { name: "bold-river-fox", status: "queued", runtime: "—" },
]

const detailStats = [
  { label: "loss", value: "0.94" },
  { label: "throughput", value: "1.2k tok/s" },
  { label: "step", value: "2,310" },
  { label: "epoch", value: "3 / 8" },
]

const lossCurve = [98, 95, 90, 88, 84, 86, 79, 74, 77, 70, 66, 68, 61, 57, 60, 52, 49, 51, 45, 41, 43, 37, 34, 36, 30, 27, 25, 23]

function WindowBar({ title, right, tabs }: { title: string; right?: ReactNode; tabs?: string[] }) {
  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        </div>
        <span className="ml-1 text-ui-caption text-muted-foreground">{title}</span>
        {right ? <span className="ml-auto flex items-center gap-2">{right}</span> : null}
      </div>
      {tabs ? (
        <div className="flex items-center gap-4 px-4 pb-2">
          {tabs.map((tab, index) => (
            <span
              key={tab}
              className={cn(
                "text-ui-micro",
                index === 0 ? "border-b border-foreground pb-1 text-foreground" : "pb-1 text-muted-foreground",
              )}
            >
              {tab}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function HeroDecoration() {
  return (
    <div className="relative h-[32rem] w-full select-none" aria-hidden>
      {/* Elevated, textured stage — bleeds off the right edge */}
      <div className="absolute inset-y-0 left-2 right-[-7rem] overflow-hidden rounded-xl border border-border bg-muted/30">
        <div className="bg-dot-grid pointer-events-none absolute inset-0 text-foreground/[0.05]" />
      </div>

      {/* Back window — runs list, peeking, bleeds right */}
      <Card variant="default" className={cn("absolute right-[-3.5rem] top-6 z-10 w-[26rem] max-w-none bg-card", float)}>
        <WindowBar
          title="tahuna · runs"
          right={<span className="text-ui-micro text-muted-foreground">6 active</span>}
        />
        <div className="grid grid-cols-[1.7fr_1fr_0.8fr] gap-3 border-b border-border px-4 py-2 text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">
          <span>Run</span>
          <span>Status</span>
          <span className="text-right">Runtime</span>
        </div>
        <div className="divide-y divide-border">
          {runRows.map((row) => (
            <div key={row.name} className="grid grid-cols-[1.7fr_1fr_0.8fr] items-center gap-3 px-4 py-2">
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

      {/* Front window — the live run (focal), overlapping lower-left */}
      <Card variant="default" className={cn("absolute left-0 top-32 z-20 w-[29rem] max-w-none bg-card", float)}>
        <WindowBar
          title="run · minimax-2.5"
          tabs={["Overview", "Logs", "Checkpoints", "System"]}
          right={
            <>
              <span className="flex items-center gap-1.5">
                <StatusDot variant="running" size="xs" />
                <span className="text-ui-micro text-muted-foreground">running</span>
              </span>
              <Maximize2 className="size-3 text-muted-foreground/60" />
              <MoreHorizontal className="size-3.5 text-muted-foreground/60" />
            </>
          }
        />

        <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
          {detailStats.map((stat) => (
            <div key={stat.label} className="px-3 py-2.5">
              <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-ui-caption text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="px-4 py-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">train/loss</span>
            <span className="text-ui-caption text-foreground">
              <span className="text-muted-foreground">2.41 → </span>0.94
            </span>
          </div>
          <div className="flex h-24 items-end gap-px border-b border-border pb-px">
            {lossCurve.map((height, index) => (
              <span key={index} className="flex-1 bg-foreground/30" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      </Card>

      {/* Floating accent — the launching command */}
      <Card variant="default" className={cn("absolute bottom-8 right-2 z-30 w-60 bg-card", float)}>
        <WindowBar title="tahuna train" />
        <div className="flex flex-col gap-1.5 px-3 py-3 text-ui-caption">
          <span className="text-foreground/85">&gt; $ tahuna init .</span>
          <span className="text-muted-foreground">&nbsp;&nbsp;entrypoint detected</span>
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
