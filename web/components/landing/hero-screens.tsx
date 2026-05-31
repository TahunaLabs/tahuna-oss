import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"
import { cn } from "@/lib/utils"

const shell = "flex h-full flex-col overflow-hidden bg-card shadow-[0_28px_80px_-32px_rgba(0,0,0,0.5)]"

function WindowBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
      <div className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
      </div>
      <span className="ml-1 text-ui-caption text-muted-foreground">{title}</span>
      {right ? <span className="ml-auto flex items-center gap-2">{right}</span> : null}
    </div>
  )
}

function Bars({ points, className }: { points: number[]; className?: string }) {
  return (
    <div className={cn("flex items-end gap-px", className)}>
      {points.map((height, index) => (
        <span key={index} className="flex-1 bg-foreground/25" style={{ height: `${height}%` }} />
      ))}
    </div>
  )
}

const loss = [98, 94, 90, 92, 84, 79, 81, 73, 68, 70, 62, 58, 60, 52, 48, 50, 43, 39, 41, 34, 30, 32, 27, 24, 26, 21, 18, 20, 16, 14]
const grad = [40, 58, 44, 62, 50, 70, 48, 66, 52, 60, 46, 64, 50, 58, 44, 56, 48, 62, 46, 54]
const lr = [96, 92, 88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44, 40, 36, 32, 28, 24, 20]
const evalLoss = [90, 84, 80, 74, 70, 66, 60, 56, 52, 48, 44, 40, 36, 33, 30, 27, 25, 22, 20, 18]
const tokens = [30, 45, 38, 55, 48, 62, 70, 58, 66, 74, 68, 80, 76, 84, 78, 88, 82, 90, 86, 92]

function MiniChart({ label, latest, points }: { label: string; latest: string; points: number[] }) {
  return (
    <div className="rounded border border-border p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-ui-micro text-muted-foreground">{label}</span>
        <span className="text-ui-micro text-foreground">{latest}</span>
      </div>
      <Bars points={points} className="h-12" />
    </div>
  )
}

// ── Runs (run detail) — dense W&B-style metrics ───────────────────
export function RunScreen() {
  return (
    <Card variant="default" className={shell}>
      <WindowBar
        title="run · minimax-2.5"
        right={
          <span className="flex items-center gap-1.5">
            <StatusDot variant="running" size="xs" />
            <span className="text-ui-micro text-muted-foreground">running · epoch 3/8</span>
          </span>
        }
      />
      <div className="flex shrink-0 items-center gap-5 border-b border-border px-4 py-2.5 text-ui-caption">
        <span className="border-b border-foreground pb-1 text-foreground">Overview</span>
        <span className="pb-1 text-muted-foreground">Logs</span>
        <span className="pb-1 text-muted-foreground">Checkpoints</span>
        <span className="pb-1 text-muted-foreground">System</span>
      </div>
      <div className="grid shrink-0 grid-cols-4 divide-x divide-border border-b border-border">
        {[
          { label: "loss", value: "0.94" },
          { label: "throughput", value: "1.2k tok/s" },
          { label: "step", value: "2,310" },
          { label: "epoch", value: "3 / 8" },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-3">
            <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-ui-caption text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="rounded border border-border p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">train/loss</span>
            <span className="text-ui-caption text-foreground">2.41 → 0.94</span>
          </div>
          <Bars points={loss} className="h-28" />
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3">
          <MiniChart label="train/grad_norm" latest="0.19" points={grad} />
          <MiniChart label="train/learning_rate" latest="1.1e-6" points={lr} />
          <MiniChart label="eval/loss" latest="0.97" points={evalLoss} />
          <MiniChart label="throughput" latest="1.2k" points={tokens} />
        </div>
      </div>
    </Card>
  )
}

// ── Environments — long table ─────────────────────────────────────
const envRows = [
  { name: "minimax-2.5", device: "H200 ×8", runtime: "pt2.4-cu124", status: "running" },
  { name: "qwen3-coder", device: "A100 ×4", runtime: "pt2.10-cu128", status: "completed" },
  { name: "llama-rl", device: "B200 ×2", runtime: "pt2.11-cu130", status: "queued" },
  { name: "phi-sft", device: "L40S ×1", runtime: "pt2.2-cu121", status: "failed" },
  { name: "mnist", device: "RTX 3090 ×1", runtime: "pt2.2-cu121", status: "completed" },
  { name: "gemma-tune", device: "H100 ×2", runtime: "pt2.4-cu124", status: "completed" },
  { name: "mixtral-lora", device: "A100 ×8", runtime: "pt2.10-cu128", status: "running" },
  { name: "whisper-ft", device: "L4 ×1", runtime: "pt2.2-cu121", status: "completed" },
  { name: "sdxl-dreambooth", device: "RTX 4090 ×1", runtime: "pt2.2-cu121", status: "completed" },
]

export function EnvironmentsScreen() {
  return (
    <Card variant="default" className={shell}>
      <WindowBar title="tahuna · environments" right={<span className="text-ui-micro text-muted-foreground">9 environments</span>} />
      <div className="grid shrink-0 grid-cols-[1.5fr_1fr_1.1fr] gap-3 border-b border-border px-4 py-2.5 text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">
        <span>Name</span>
        <span>Device</span>
        <span>Runtime</span>
      </div>
      <div className="flex flex-1 flex-col divide-y divide-border">
        {envRows.map((row) => (
          <div key={row.name} className="grid flex-1 grid-cols-[1.5fr_1fr_1.1fr] items-center gap-3 px-4">
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

// ── Overview — KPIs + activity + recent runs ──────────────────────
const activity = [20, 35, 28, 52, 44, 70, 58, 80, 66, 90, 74, 96, 82, 88]
const recentRuns = [
  { name: "mellow-forest-wolf", status: "completed", time: "3d ago" },
  { name: "rapid-meadow-tiger", status: "failed", time: "4d ago" },
  { name: "drift-harbor-yak", status: "completed", time: "10d ago" },
  { name: "crisp-valley-lynx", status: "failed", time: "11d ago" },
  { name: "rapid-river-tiger", status: "completed", time: "14d ago" },
]

export function OverviewScreen() {
  return (
    <Card variant="default" className={shell}>
      <WindowBar title="tahuna · overview" />
      <div className="grid shrink-0 grid-cols-4 divide-x divide-border border-b border-border">
        {[
          { label: "active", value: "3" },
          { label: "success", value: "92%" },
          { label: "gpu hrs", value: "184" },
          { label: "deployed", value: "5" },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-3.5">
            <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="shrink-0 border-b border-border px-4 py-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">training activity</span>
          <span className="text-ui-micro text-muted-foreground">last 14 days</span>
        </div>
        <Bars points={activity} className="h-32 gap-1.5" />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
          <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">recent runs</span>
          <span className="text-ui-micro text-muted-foreground">view all</span>
        </div>
        <div className="flex flex-1 flex-col divide-y divide-border border-t border-border">
          {recentRuns.map((run) => (
            <div key={run.name} className="flex flex-1 items-center gap-2 px-4">
              <StatusDot variant={toStatusDotVariant(run.status)} size="xs" />
              <span className="truncate text-ui-caption text-foreground">{run.name}</span>
              <span className="ml-auto text-ui-micro text-muted-foreground">{run.time}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
