import { Gauge } from "@/components/ui/gauge"

type CreditsGaugeProps = {
  balanceCents: number
  maxCents: number
}

function CreditsGauge({ balanceCents, maxCents }: CreditsGaugeProps) {
  const percentage = maxCents > 0 ? Math.min(100, (balanceCents / maxCents) * 100) : 0
  const isLow = percentage < 20
  const isCritical = percentage < 5

  const variant = isCritical ? "destructive" : isLow ? "warning" : "accent"

  return (
    <Gauge
      percentage={percentage}
      label="Credits"
      variant={variant}
      size="md"
    />
  )
}

export { CreditsGauge }
