import { Gauge } from "@/components/ui/gauge"

type CreditsGaugeProps = {
  balanceCents: number
  maxCents: number
}

function CreditsGauge({ balanceCents, maxCents }: CreditsGaugeProps) {
  const percentage = maxCents > 0 ? Math.min(100, (balanceCents / maxCents) * 100) : 0

  return (
    <Gauge
      percentage={percentage}
      label="Credits"
      size="md"
      gradient
    />
  )
}

export { CreditsGauge }
