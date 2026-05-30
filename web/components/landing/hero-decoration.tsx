import { Card } from "@/components/ui/card"
import { StatusDot } from "@/components/ui/status-dot"

// Descending train-loss curve — one run's live metrics.
const lossCurve = [96, 90, 84, 79, 81, 72, 67, 63, 65, 56, 52, 49, 44, 46, 38, 34, 31, 27, 24, 19]

const stats = [
  { label: "epoch", value: "3 / 8" },
  { label: "throughput", value: "1.2k tok/s" },
  { label: "step", value: "2,310" },
]

export function HeroDecoration() {
  return (
    <div className="relative mx-auto h-[24rem] w-full max-w-lg select-none lg:mx-0" aria-hidden>
      {/* Main panel: a single run's live metrics — angled, bleeds off the right edge */}
      <Card variant="default" className="absolute left-0 top-4 w-[32rem] max-w-none rotate-1 bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-ui-caption text-foreground">minimax-2.5</span>
          <span className="flex items-center gap-1.5">
            <StatusDot variant="running" size="xs" />
            <span className="text-ui-micro text-muted-foreground">running · epoch 3/8</span>
          </span>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">train loss</span>
              <span className="text-ui-caption text-foreground">
                <span className="text-muted-foreground">2.41 → </span>0.94
              </span>
            </div>
            <div className="flex h-16 items-end gap-0.5">
              {lossCurve.map((height, index) => (
                <span key={index} className="flex-1 bg-foreground/25" style={{ height: `${height}%` }} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-0.5">
                <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{stat.label}</span>
                <span className="text-ui-caption text-foreground">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Overlapping terminal accent — the command that started the run */}
      <Card variant="default" className="absolute -bottom-2 left-[-1.5rem] z-10 w-56 -rotate-2 bg-card">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
          <div className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
          </div>
          <span className="ml-1 text-ui-micro text-muted-foreground">tahuna train</span>
        </div>
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
