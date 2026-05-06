import { Gauge } from "@/components/ui/gauge"
import { Skeleton } from "@/components/ui/skeleton"

type CreditsGaugeProps = {
  balanceCents: number
  maxCents: number
}

function CreditsGauge({ balanceCents, maxCents }: CreditsGaugeProps) {
  const percentage = maxCents > 0 ? Math.min(100, (balanceCents / maxCents) * 100) : 0

  return (
    <div className="flex w-full items-center justify-between gap-3">
      <p className="text-xs font-medium text-sidebar-foreground">Credits</p>
      <Gauge percentage={percentage} size="sm" className="w-24" />
    </div>
  )
}

function CreditsGaugeSkeleton() {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <p className="text-xs font-medium text-sidebar-foreground">Credits</p>
      <Skeleton className="h-2 w-24 rounded-sm" />
    </div>
  )
}

export { CreditsGauge, CreditsGaugeSkeleton }
