import type { ReactNode } from "react"
import {
  Activity,
  ExternalLink,
  HardDriveDownload,
  LayoutGrid,
  ListChecks,
  Play,
  Search,
  Server,
  Terminal,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"
import { cn } from "@/lib/utils"

// Tall, densely-packed screens with fixed artwork dimensions. HeroProduct clips
// them on the right so they read as a screenshot continuing past the column edge.
// Each screen mirrors the structure of the real dashboard view it is named for
// (see components/features/dashboard) under the Mono theme: square corners,
// monochrome chart-1 charts, surface cards, the same section headers.
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

// In-app section header — matches DashboardSectionHeader (icon + title + count).
function SectionTitle({
  icon,
  title,
  count,
  hint,
}: {
  icon: ReactNode
  title: string
  count?: string
  hint?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center text-foreground [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </span>
      <h2 className="text-lg font-medium tracking-tight text-foreground">{title}</h2>
      {count ? <span className="text-ui-caption text-muted-foreground">{count}</span> : null}
      {hint ? <span className="ml-auto text-ui-caption text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

// Mock of the search + filter toolbar the real views render above their tables.
function ToolbarMock({ filters }: { filters: string[] }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded border border-border px-2.5 text-ui-caption text-muted-foreground">
        <Search className="h-3.5 w-3.5" />
        <span>Search</span>
      </div>
      {filters.map((filter) => (
        <span
          key={filter}
          className="flex h-8 shrink-0 items-center rounded border border-border px-2.5 text-ui-caption text-muted-foreground"
        >
          {filter}
        </span>
      ))}
    </div>
  )
}

// ── Charts — monochrome var(--chart-1), matching recharts in the real views ──
// Points are 0–100 height percentages; the SVG is stretched to fill its box and
// strokes stay crisp via non-scaling-stroke.
function linePath(points: number[]) {
  const stepX = 100 / (points.length - 1)
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${(index * stepX).toFixed(2)} ${(100 - point).toFixed(2)}`)
    .join(" ")
}

function LineSpark({ points, className }: { points: number[]; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden>
      {[25, 50, 75].map((y) => (
        <line
          key={y}
          x1="0"
          y1={y}
          x2="100"
          y2={y}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.5}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path
        d={linePath(points)}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function AreaSpark({ points, className }: { points: number[]; className?: string }) {
  const line = linePath(points)
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="hero-area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L100 100 L0 100 Z`} fill="url(#hero-area-fill)" stroke="none" />
      <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// Chart series
const loss = [98, 94, 90, 92, 84, 79, 81, 73, 68, 70, 62, 58, 60, 52, 48, 50, 43, 39, 41, 34, 30, 32, 27, 24, 26, 21, 18, 20, 16, 14]
const evalLoss = [90, 84, 80, 74, 70, 66, 60, 56, 52, 48, 44, 40, 36, 33, 30, 27, 25, 22, 20, 18]
const grad = [40, 58, 44, 62, 50, 70, 48, 66, 52, 60, 46, 64, 50, 58, 44, 56, 48, 62, 46, 54]
const lr = [96, 92, 88, 84, 80, 76, 72, 68, 64, 60, 56, 52, 48, 44, 40, 36, 32, 28, 24, 20]
const tokens = [30, 45, 38, 55, 48, 62, 70, 58, 66, 74, 68, 80, 76, 84, 78, 88, 82, 90, 86, 92]
const gpuUtil = [78, 82, 80, 86, 84, 88, 85, 90, 87, 92, 89, 94, 91, 95, 90, 96, 93, 97, 94, 98]
const activitySeries = [20, 35, 28, 52, 44, 70, 58, 80, 66, 90, 74, 96, 82, 88]

// ── Overview — KPI cards + activity area chart + recent runs ──────
const overviewKpis = [
  { label: "Active runs", value: "3", hint: "Provisioning or running" },
  { label: "Success rate", value: "92%", hint: "Completed vs failed" },
  { label: "GPU hours", value: "184.0", hint: "Across all runs" },
  { label: "Deployed", value: "5", hint: "Models serving" },
]

const recentRuns = [
  { name: "mellow-forest-wolf", status: "completed", env: "mnist", time: "3d ago" },
  { name: "warm-meadow-otter", status: "running", env: "mixtral-lora", time: "5h ago" },
  { name: "rapid-meadow-tiger", status: "failed", env: "mnist", time: "4d ago" },
  { name: "bold-summit-owl", status: "running", env: "phi-sft", time: "1h ago" },
  { name: "drift-harbor-yak", status: "completed", env: "qwen3-coder", time: "10d ago" },
  { name: "brisk-harbor-seal", status: "queued", env: "bert-classifier", time: "1d ago" },
  { name: "calm-harbor-fox", status: "completed", env: "gemma-tune", time: "2d ago" },
]

export function OverviewScreen() {
  return (
    <Card variant="default" className={shell}>
      <WindowBar title="tahuna · overview" />
      <div className="flex-1 space-y-3 overflow-hidden p-4">
        <SectionTitle icon={<LayoutGrid />} title="Overview" hint="Your training at a glance." />

        <div className="grid grid-cols-4 gap-3">
          {overviewKpis.map((kpi) => (
            <Card key={kpi.label} variant="surface" className="p-3">
              <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{kpi.label}</p>
              <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{kpi.value}</p>
              <p className="mt-0.5 text-ui-micro text-muted-foreground">{kpi.hint}</p>
            </Card>
          ))}
        </div>

        <Card variant="surface" className="p-4">
          <h3 className="text-ui-caption font-semibold text-foreground">Training activity</h3>
          <p className="text-ui-micro text-muted-foreground">Runs started over the last 14 days</p>
          <AreaSpark points={activitySeries} className="mt-3 h-24 w-full" />
        </Card>

        <Card variant="surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-ui-caption font-semibold text-foreground">Recent runs</h3>
            <span className="text-ui-micro text-muted-foreground">View all</span>
          </div>
          <div className="divide-y divide-border">
            {recentRuns.map((run) => (
              <div key={run.name} className="grid grid-cols-[1.5fr_1fr_1fr_auto] items-center gap-3 px-4 py-2">
                <span className="truncate text-ui-caption text-foreground">{run.name}</span>
                <span className="flex items-center gap-1.5 text-ui-micro capitalize text-muted-foreground">
                  <StatusDot variant={toStatusDotVariant(run.status)} size="xs" />
                  {run.status}
                </span>
                <span className="truncate text-ui-micro text-muted-foreground">{run.env}</span>
                <span className="text-right text-ui-micro text-muted-foreground">{run.time}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Card>
  )
}

// ── Runs — DashboardTable: Name / Status / Environment / Started / Runtime ──
const runsList = [
  { name: "warm-meadow-otter", status: "running", env: "mixtral-lora", started: "5h ago", runtime: "5h 12m" },
  { name: "bold-summit-owl", status: "running", env: "phi-sft", started: "1h ago", runtime: "1h 02m" },
  { name: "mamba-base-sweep", status: "running", env: "mamba-base", started: "22m ago", runtime: "22m 8s" },
  { name: "brisk-harbor-seal", status: "queued", env: "bert-classifier", started: "1d ago", runtime: "—" },
  { name: "deepseek-rl-warm", status: "provisioning", env: "deepseek-rl", started: "3m ago", runtime: "3m 1s" },
  { name: "mellow-forest-wolf", status: "completed", env: "mnist", started: "3d ago", runtime: "1h 48m" },
  { name: "calm-harbor-fox", status: "completed", env: "gemma-tune", started: "2d ago", runtime: "2h 30m" },
  { name: "drift-harbor-yak", status: "completed", env: "qwen3-coder", started: "10d ago", runtime: "6h 04m" },
  { name: "rapid-meadow-tiger", status: "failed", env: "mnist", started: "4d ago", runtime: "12m 3s" },
  { name: "crisp-valley-lynx", status: "failed", env: "llama-rl", started: "11d ago", runtime: "44m 9s" },
  { name: "swift-canyon-hawk", status: "completed", env: "deepseek-rl", started: "6d ago", runtime: "3h 17m" },
  { name: "lone-summit-crane", status: "completed", env: "whisper-ft", started: "8d ago", runtime: "55m 2s" },
  { name: "pale-river-moth", status: "completed", env: "t5-summarizer", started: "9d ago", runtime: "1h 09m" },
]

const runsGridCols = "grid grid-cols-[1.7fr_1fr_1.2fr_0.9fr_0.9fr_auto] items-center gap-3"

export function RunsScreen() {
  return (
    <Card variant="default" className={shell}>
      <WindowBar title="tahuna · runs" />
      <div className="flex-1 space-y-3 overflow-hidden p-4">
        <SectionTitle icon={<Play />} title="Runs" count="13" />
        <ToolbarMock filters={["All runs"]} />

        <Card variant="surface">
          <div className={cn(runsGridCols, "border-b border-border px-4 py-2.5 text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground")}>
            <span>Name</span>
            <span>Status</span>
            <span>Environment</span>
            <span>Started</span>
            <span>Runtime</span>
            <span />
          </div>
          <div className="divide-y divide-border">
            {runsList.map((run) => (
              <div key={run.name} className={cn(runsGridCols, "px-4 py-2")}>
                <span className="truncate text-ui-caption text-foreground">{run.name}</span>
                <span className="flex items-center gap-1.5 text-ui-micro capitalize text-muted-foreground">
                  <StatusDot variant={toStatusDotVariant(run.status)} size="xs" />
                  {run.status}
                </span>
                <span className="truncate text-ui-micro text-muted-foreground">{run.env}</span>
                <span className="text-ui-micro text-muted-foreground">{run.started}</span>
                <span className="text-ui-micro text-muted-foreground">{run.runtime}</span>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Card>
  )
}

// ── Run detail — header + tab bar + stat tiles + line-chart metric grid ──
const detailTabs = [
  { label: "Overview", icon: Activity, active: true },
  { label: "Logs", icon: Terminal, active: false },
  { label: "Checkpoints & Artifacts", icon: HardDriveDownload, active: false },
  { label: "System", icon: ListChecks, active: false },
]

const statTiles = [
  { label: "Status", value: "running" },
  { label: "Duration", value: "1h 12m" },
  { label: "Environment", value: "minimax-2.5" },
  { label: "Compute", value: "H200 ×8", detail: "200GB volume" },
]

const runMetrics = [
  { name: "train/loss", latest: "0.94", count: 120, points: loss },
  { name: "eval/loss", latest: "0.97", count: 12, points: evalLoss },
  { name: "train/grad_norm", latest: "0.19", count: 120, points: grad },
  { name: "train/learning_rate", latest: "1.1e-6", count: 120, points: lr },
  { name: "throughput", latest: "1.2k tok/s", count: 120, points: tokens },
  { name: "gpu/util", latest: "98%", count: 120, points: gpuUtil },
]

export function RunScreen() {
  return (
    <Card variant="default" className={shell}>
      <WindowBar title="run · minimax-2.5" />
      <div className="flex-1 space-y-4 overflow-hidden p-4">
        <header className="flex items-center gap-2.5 border-b border-border pb-4">
          <StatusDot variant="running" size="md" />
          <h2 className="text-lg font-semibold text-foreground">minimax-2.5</h2>
          <Badge variant="status-success">running</Badge>
        </header>

        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {detailTabs.map((tab) => {
            const Icon = tab.icon
            return (
              <span
                key={tab.label}
                className={cn(
                  "flex items-center gap-1.5 rounded px-3 py-1.5 text-ui-caption",
                  tab.active ? "bg-background text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </span>
            )
          })}
        </div>

        <div className="grid grid-cols-4 gap-3">
          {statTiles.map((tile) => (
            <Card key={tile.label} variant="surface" className="p-3">
              <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{tile.label}</p>
              <p className="mt-1.5 truncate text-base font-semibold capitalize text-foreground">{tile.value}</p>
              {tile.detail ? <p className="mt-0.5 text-ui-micro text-muted-foreground">{tile.detail}</p> : null}
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {runMetrics.map((metric) => (
            <div key={metric.name} className="rounded border border-border p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-ui-caption font-medium text-foreground">{metric.name}</p>
                  <p className="text-ui-micro text-muted-foreground">{metric.count} points</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-ui-micro uppercase tracking-wide text-muted-foreground">Latest</p>
                  <p className="text-ui-caption text-foreground">{metric.latest}</p>
                </div>
              </div>
              <LineSpark points={metric.points} className="h-14 w-full" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

// ── Environments — table: Name / Runtime / Device / Access ────────
const envRows = [
  { name: "minimax-2.5", runtime: "torch:2.4-cu124", device: "H200 ×8", access: "private", status: "running" },
  { name: "mixtral-lora", runtime: "torch:2.10-cu128", device: "A100 ×8", access: "shared", status: "running" },
  { name: "mamba-base", runtime: "torch:2.10-cu128", device: "H100 ×4", access: "private", status: "running" },
  { name: "qwen3-coder", runtime: "torch:2.10-cu128", device: "A100 ×4", access: "shared", status: "completed" },
  { name: "llama-rl", runtime: "torch:2.11-cu130", device: "B200 ×2", access: "private", status: "queued" },
  { name: "deepseek-rl", runtime: "torch:2.11-cu130", device: "H200 ×4", access: "private", status: "queued" },
  { name: "phi-sft", runtime: "torch:2.2-cu121", device: "L40S ×1", access: "private", status: "failed" },
  { name: "gemma-tune", runtime: "torch:2.4-cu124", device: "H100 ×2", access: "shared", status: "completed" },
  { name: "whisper-ft", runtime: "torch:2.2-cu121", device: "L4 ×1", access: "private", status: "completed" },
  { name: "bert-classifier", runtime: "torch:2.10-cu128", device: "L40S ×2", access: "shared", status: "completed" },
  { name: "t5-summarizer", runtime: "torch:2.2-cu121", device: "A100 ×2", access: "private", status: "completed" },
  { name: "clip-finetune", runtime: "torch:2.4-cu124", device: "L40S ×1", access: "private", status: "completed" },
  { name: "sdxl-dreambooth", runtime: "torch:2.2-cu121", device: "RTX 4090 ×1", access: "private", status: "completed" },
]

const envGridCols = "grid grid-cols-[1.5fr_1.3fr_1fr_0.8fr] items-center gap-3"

export function EnvironmentsScreen() {
  return (
    <Card variant="default" className={shell}>
      <WindowBar title="tahuna · environments" />
      <div className="flex-1 space-y-3 overflow-hidden p-4">
        <SectionTitle icon={<Server />} title="Environments" count="13" />
        <ToolbarMock filters={["Any access", "Any runtime", "Any device"]} />

        <Card variant="surface">
          <div className={cn(envGridCols, "border-b border-border px-4 py-2.5 text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground")}>
            <span>Name</span>
            <span>Runtime</span>
            <span>Device</span>
            <span>Access</span>
          </div>
          <div className="divide-y divide-border">
            {envRows.map((row) => (
              <div key={row.name} className={cn(envGridCols, "px-4 py-2")}>
                <span className="flex items-center gap-1.5 truncate text-ui-caption text-foreground">
                  <StatusDot variant={toStatusDotVariant(row.status)} size="xs" />
                  {row.name}
                </span>
                <span className="truncate text-ui-micro text-muted-foreground">{row.runtime}</span>
                <span className="text-ui-micro text-muted-foreground">{row.device}</span>
                <span className="text-ui-micro capitalize text-muted-foreground">{row.access}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Card>
  )
}
