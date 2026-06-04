import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"
import { cn } from "@/lib/utils"

// Tall, densely-packed screens with fixed artwork dimensions. HeroProduct clips
// them on the right so they read as a screenshot continuing past the column edge.
const shell = "flex h-[42rem] w-[44rem] flex-col overflow-hidden bg-card shadow-float xl:w-[52rem]"

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
const gpuUtil = [78, 82, 80, 86, 84, 88, 85, 90, 87, 92, 89, 94, 91, 95, 90, 96, 93, 97, 94, 98]
const memory = [60, 62, 61, 64, 63, 66, 65, 68, 67, 70, 69, 72, 71, 73, 72, 74, 73, 75, 74, 76]

function MiniChart({ label, latest, points }: { label: string; latest: string; points: number[] }) {
  return (
    <div className="rounded border border-border p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="truncate text-ui-micro text-muted-foreground">{label}</span>
        <span className="text-ui-micro text-foreground">{latest}</span>
      </div>
      <Bars points={points} className="h-10" />
    </div>
  )
}

// ── Metrics CLI — tailing gsm8k/acc for two runs ──────────────────
const metricsRows = [
  { step: 100,  gemma: "0.3124", qwen: "0.2891" },
  { step: 200,  gemma: "0.3560", qwen: "0.3247" },
  { step: 300,  gemma: "0.3892", qwen: "0.3589" },
  { step: 400,  gemma: "0.4231", qwen: "0.3901" },
  { step: 500,  gemma: "0.4521", qwen: "0.4178" },
  { step: 600,  gemma: "0.4799", qwen: "0.4432" },
  { step: 700,  gemma: "0.5012", qwen: "0.4687" },
  { step: 800,  gemma: "0.5247", qwen: "0.4921" },
  { step: 900,  gemma: "0.5489", qwen: "0.5184" },
  { step: 1000, gemma: "0.5712", qwen: "0.5412" },
  { step: 1100, gemma: "0.5934", qwen: "0.5638" },
  { step: 1200, gemma: "0.6143", qwen: "0.5871" },
  { step: 1300, gemma: "0.6378", qwen: "0.6099" },
  { step: 1400, gemma: "0.6589", qwen: "0.6314" },
]

export function MetricsScreen() {
  return (
    <Card variant="default" className={shell}>
      <WindowBar title="tahuna metrics" />
      <div className="flex-1 overflow-hidden p-4 font-mono text-xs">
        {/* command line */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-muted-foreground">$</span>
          <span className="text-foreground/90">
            tahuna run metrics gemma4-e2b qwen3-5-2b{" "}
            <span className="text-muted-foreground">--metric</span>{" "}
            <span className="text-foreground">gsm8k/acc</span>
          </span>
        </div>

        {/* status line */}
        <div className="mb-3 text-muted-foreground">
          tailing <span className="text-foreground/80">gsm8k/acc</span> &nbsp;·&nbsp; 2 runs
        </div>

        {/* table header */}
        <div className="mb-1 grid grid-cols-[5rem_7rem_7rem] gap-2 border-b border-border pb-1 uppercase tracking-ui-eyebrow text-muted-foreground">
          <span>step</span>
          <span>gemma4-e2b</span>
          <span>qwen3-5-2b</span>
        </div>

        {/* rows */}
        <div className="divide-y divide-border/40">
          {metricsRows.map((row, i) => {
            const isLive = i === metricsRows.length - 1
            return (
              <div
                key={row.step}
                className={cn(
                  "grid grid-cols-[5rem_7rem_7rem] gap-2 py-1.5",
                  isLive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span>{row.step}</span>
                <span className={cn(isLive && "font-medium text-[hsl(var(--primary))]")}>{row.gemma}</span>
                <span className={cn(isLive && "font-medium")}>{row.qwen}</span>
              </div>
            )
          })}
        </div>

        {/* live cursor */}
        <div className="mt-2 flex items-center gap-2 text-muted-foreground">
          <span className="text-foreground/60">$</span>
          <span className="inline-block h-3.5 w-1.5 animate-pulse bg-foreground/60" />
        </div>
      </div>
    </Card>
  )
}

// ── Runs (run detail) — dense W&B-style metric grid ───────────────
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
          <div key={stat.label} className="px-4 py-2.5">
            <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-ui-caption text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 p-4">
        <MiniChart label="train/loss" latest="0.94" points={loss} />
        <MiniChart label="eval/loss" latest="0.97" points={evalLoss} />
        <MiniChart label="train/grad_norm" latest="0.19" points={grad} />
        <MiniChart label="train/learning_rate" latest="1.1e-6" points={lr} />
        <MiniChart label="throughput" latest="1.2k tok/s" points={tokens} />
        <MiniChart label="gpu/util" latest="98%" points={gpuUtil} />
        <MiniChart label="gpu/memory" latest="76 GB" points={memory} />
        <MiniChart label="train/epoch" latest="3 / 8" points={tokens} />
      </div>
    </Card>
  )
}

// ── Environments — dense, packed table ────────────────────────────
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
  { name: "bert-classifier", device: "L40S ×2", runtime: "pt2.10-cu128", status: "completed" },
  { name: "deepseek-rl", device: "H200 ×4", runtime: "pt2.11-cu130", status: "queued" },
  { name: "t5-summarizer", device: "A100 ×2", runtime: "pt2.2-cu121", status: "completed" },
  { name: "clip-finetune", device: "L40S ×1", runtime: "pt2.4-cu124", status: "completed" },
  { name: "mamba-base", device: "H100 ×4", runtime: "pt2.10-cu128", status: "running" },
  { name: "yolo-detect", device: "RTX 4090 ×2", runtime: "pt2.2-cu121", status: "completed" },
  { name: "rwkv-world", device: "A100 ×1", runtime: "pt2.11-cu130", status: "queued" },
  { name: "phi3-distill", device: "B200 ×4", runtime: "pt2.11-cu130", status: "completed" },
]

export function EnvironmentsScreen() {
  return (
    <Card variant="default" className={shell}>
      <WindowBar title="tahuna · environments" right={<span className="text-ui-micro text-muted-foreground">12 environments</span>} />
      <div className="grid shrink-0 grid-cols-[1.5fr_1fr_1.1fr] gap-3 border-b border-border px-4 py-2.5 text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">
        <span>Name</span>
        <span>Device</span>
        <span>Runtime</span>
      </div>
      <div className="divide-y divide-border">
        {envRows.map((row) => (
          <div key={row.name} className="grid grid-cols-[1.5fr_1fr_1.1fr] items-center gap-3 px-4 py-2.5">
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

// ── Overview — KPIs + activity + packed recent runs ───────────────
const activity = [20, 35, 28, 52, 44, 70, 58, 80, 66, 90, 74, 96, 82, 88]
const recentRuns = [
  { name: "mellow-forest-wolf", env: "mnist", status: "completed", time: "3d ago" },
  { name: "rapid-meadow-tiger", env: "mnist", status: "failed", time: "4d ago" },
  { name: "drift-harbor-yak", env: "qwen3-coder", status: "completed", time: "10d ago" },
  { name: "crisp-valley-lynx", env: "llama-rl", status: "failed", time: "11d ago" },
  { name: "rapid-river-tiger", env: "mnist", status: "completed", time: "14d ago" },
  { name: "bold-summit-owl", env: "phi-sft", status: "running", time: "1h ago" },
  { name: "calm-harbor-fox", env: "gemma-tune", status: "completed", time: "2d ago" },
  { name: "warm-meadow-otter", env: "mixtral-lora", status: "running", time: "5h ago" },
  { name: "swift-canyon-hawk", env: "deepseek-rl", status: "completed", time: "6d ago" },
  { name: "lone-summit-crane", env: "whisper-ft", status: "completed", time: "8d ago" },
  { name: "brisk-harbor-seal", env: "bert-classifier", status: "queued", time: "1d ago" },
  { name: "pale-river-moth", env: "t5-summarizer", status: "completed", time: "9d ago" },
  { name: "quiet-forest-elk", env: "sdxl-dreambooth", status: "completed", time: "12d ago" },
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
          <div key={stat.label} className="px-4 py-3">
            <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">training activity</span>
          <span className="text-ui-micro text-muted-foreground">last 14 days</span>
        </div>
        <Bars points={activity} className="h-24 gap-1.5" />
      </div>
      <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
        <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">recent runs</span>
        <span className="text-ui-micro text-muted-foreground">view all</span>
      </div>
      <div className="divide-y divide-border border-t border-border">
        {recentRuns.map((run) => (
          <div key={run.name} className="grid grid-cols-[1.6fr_1fr_auto] items-center gap-3 px-4 py-2.5">
            <span className="flex items-center gap-1.5 truncate text-ui-caption text-foreground">
              <StatusDot variant={toStatusDotVariant(run.status)} size="xs" />
              {run.name}
            </span>
            <span className="truncate text-ui-micro text-muted-foreground">{run.env}</span>
            <span className="text-right text-ui-micro text-muted-foreground">{run.time}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
