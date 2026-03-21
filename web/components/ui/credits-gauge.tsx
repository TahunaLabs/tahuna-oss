import { Gauge } from "@/components/ui/gauge"

type CreditsGaugeProps = {
  balanceCents: number
  maxCents: number
}

function CreditsGauge({ balanceCents, maxCents }: CreditsGaugeProps) {
  const percentage = maxCents > 0 ? Math.min(100, (balanceCents / maxCents) * 100) : 0

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Credits</p>
      <Gauge percentage={percentage} size="sm" />
    </div>
  )
}

export { CreditsGauge }
