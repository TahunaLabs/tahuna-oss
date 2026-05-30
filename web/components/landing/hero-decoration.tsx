import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"

const runRows = [
  { name: "minimax-2.5", status: "running", device: "H200 ×8", runtime: "pt2.4-cu124" },
  { name: "qwen3-coder", status: "provisioning", device: "B200 ×2", runtime: "pt2.5-cu128" },
  { name: "llama-rl", status: "queued", device: "A100 ×4", runtime: "pt2.2-cu121" },
  { name: "phi-sft", status: "failed", device: "L40S ×1", runtime: "pt2.2-cu121" },
]

const lossSparkline = [92, 80, 74, 66, 58, 52, 47, 39, 34, 28, 23, 18]

const columns = "grid-cols-[1.5fr_1.1fr_1fr_1.1fr]"

export function HeroDecoration() {
  return (
    <div className="relative mx-auto h-[26rem] w-full max-w-lg select-none lg:mx-0" aria-hidden>
      {/* Main panel: runs table — angled, bleeds off the right edge */}
      <Card variant="default" className="absolute left-0 top-2 w-[34rem] max-w-none rotate-1 bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground/30" />
            <span className="size-2 rounded-full bg-muted-foreground/30" />
            <span className="size-2 rounded-full bg-muted-foreground/30" />
          </div>
          <span className="ml-1 text-ui-caption text-muted-foreground">tahuna runs</span>
          <Badge variant="run-status" className="ml-auto">
            4 active
          </Badge>
        </div>

        <div className={`grid ${columns} gap-3 border-b border-border px-4 py-2 text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground`}>
          <span>Run</span>
          <span>Status</span>
          <span>Device</span>
          <span>Runtime</span>
        </div>

        <div className="divide-y divide-border">
          {runRows.map((row) => (
            <div key={row.name} className={`grid ${columns} items-center gap-3 px-4 py-2.5`}>
              <span className="truncate text-ui-caption text-foreground">{row.name}</span>
              <span className="flex items-center gap-1.5">
                <StatusDot variant={toStatusDotVariant(row.status)} size="xs" />
                <span className="text-ui-micro capitalize text-muted-foreground">{row.status}</span>
              </span>
              <span className="text-ui-micro text-muted-foreground">{row.device}</span>
              <span className="text-ui-micro text-muted-foreground">{row.runtime}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Overlapping live-run card — counter-rotated, lifts off the table */}
      <Card variant="default" className="absolute -bottom-1 left-[-1.25rem] z-10 w-60 -rotate-2 bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">minimax-2.5</span>
          <span className="flex items-center gap-1.5">
            <StatusDot variant="running" size="xs" />
            <span className="text-ui-micro text-muted-foreground">running</span>
          </span>
        </div>

        <div className="flex flex-col gap-2.5 px-3 py-3">
          <div className="flex h-8 items-end gap-0.5">
            {lossSparkline.map((height, index) => (
              <span key={index} className="flex-1 bg-foreground/25" style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-ui-micro text-muted-foreground">epoch</span>
            <span className="text-ui-caption text-foreground">3 / 8</span>
          </div>
          <div className="h-1 w-full bg-border">
            <div className="h-1 w-2/5 bg-foreground" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-ui-micro text-muted-foreground">loss</span>
            <span className="text-ui-caption text-foreground">
              <span className="text-muted-foreground">2.41 → 1.87 →</span> 0.94
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}
