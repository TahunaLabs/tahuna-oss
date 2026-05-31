import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"

const float = "shadow-[0_28px_70px_-30px_rgba(0,0,0,0.45)]"

function WindowBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
      <div className="flex gap-1.5">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
      </div>
      <span className="ml-1 text-ui-caption text-muted-foreground">{title}</span>
      {right ? <span className="ml-auto flex items-center gap-2">{right}</span> : null}
    </div>
  )
}

const lossCurve = [96, 90, 84, 79, 81, 72, 67, 63, 65, 56, 52, 49, 44, 46, 38, 34, 31, 27, 24, 19, 22, 16]
const activityCurve = [20, 35, 28, 52, 44, 70, 58, 80, 66, 90, 74, 96]

// ── Runs (run detail) ─────────────────────────────────────────────
export function RunScreen() {
  return (
    <Card variant="default" className={`bg-card ${float}`}>
      <WindowBar
        title="run · minimax-2.5"
        right={
          <span className="flex items-center gap-1.5">
            <StatusDot variant="running" size="xs" />
            <span className="text-ui-micro text-muted-foreground">running</span>
          </span>
        }
      />
      <div className="flex items-center gap-5 border-b border-border px-4 py-2.5 text-ui-caption">
        <span className="border-b border-foreground pb-1 text-foreground">Overview</span>
        <span className="pb-1 text-muted-foreground">Logs</span>
        <span className="pb-1 text-muted-foreground">Checkpoints</span>
        <span className="pb-1 text-muted-foreground">System</span>
      </div>
      <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
        {[
          { label: "loss", value: "0.94" },
          { label: "throughput", value: "1.2k tok/s" },
          { label: "step", value: "2,310" },
          { label: "epoch", value: "3 / 8" },
        ].map((stat) => (
          <div key={stat.label} className="px-3 py-2.5">
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
        <div className="flex h-28 items-end gap-0.5 border-b border-border pb-px">
          {lossCurve.map((height, index) => (
            <span key={index} className="flex-1 bg-foreground/30" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </Card>
  )
}

// ── Environments ──────────────────────────────────────────────────
const envRows = [
  { name: "minimax-2.5", device: "H200 ×8", runtime: "pt2.4-cu124", status: "running" },
  { name: "qwen3-coder", device: "A100 ×4", runtime: "pt2.10-cu128", status: "completed" },
  { name: "llama-rl", device: "B200 ×2", runtime: "pt2.11-cu130", status: "queued" },
  { name: "phi-sft", device: "L40S ×1", runtime: "pt2.2-cu121", status: "completed" },
  { name: "mnist", device: "RTX 3090 ×1", runtime: "pt2.2-cu121", status: "completed" },
]

export function EnvironmentsScreen() {
  return (
    <Card variant="default" className={`bg-card ${float}`}>
      <WindowBar title="tahuna · environments" right={<span className="text-ui-micro text-muted-foreground">5 environments</span>} />
      <div className="grid grid-cols-[1.5fr_1fr_1.1fr] gap-3 border-b border-border px-4 py-2 text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">
        <span>Name</span>
        <span>Device</span>
        <span>Runtime</span>
      </div>
      <div className="divide-y divide-border">
        {envRows.map((row) => (
          <div key={row.name} className="grid grid-cols-[1.5fr_1fr_1.1fr] items-center gap-3 px-4 py-3">
            <span className="flex items-center gap-1.5 truncate text-ui-caption text-foreground">
              <StatusDot variant={toStatusDotVariant(row.status)} size="xs" />
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

// ── Overview ──────────────────────────────────────────────────────
export function OverviewScreen() {
  return (
    <Card variant="default" className={`bg-card ${float}`}>
      <WindowBar title="tahuna · overview" />
      <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
        {[
          { label: "active", value: "3" },
          { label: "success", value: "92%" },
          { label: "gpu hrs", value: "184" },
          { label: "deployed", value: "5" },
        ].map((stat) => (
          <div key={stat.label} className="px-3 py-3">
            <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-base font-semibold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="px-4 py-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">training activity</span>
          <span className="text-ui-micro text-muted-foreground">last 14 days</span>
        </div>
        <div className="flex h-28 items-end gap-1.5">
          {activityCurve.map((height, index) => (
            <span key={index} className="flex-1 bg-foreground/25" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </Card>
  )
}
