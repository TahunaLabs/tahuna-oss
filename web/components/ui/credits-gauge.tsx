import { cn } from "@/lib/utils"

type CreditsGaugeProps = {
  balanceCents: number
  maxCents: number
  currency: string
  className?: string
}

function formatMoney(cents: number, currency: string) {
  const amount = Math.max(0, cents) / 100
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount.toFixed(0)} ${currency}`
  }
}

function CreditsGauge({ balanceCents, maxCents, currency, className }: CreditsGaugeProps) {
  const percentage = maxCents > 0 ? Math.min(100, (balanceCents / maxCents) * 100) : 0
  const isLow = percentage < 20
  const isCritical = percentage < 5

  const bgColor = isCritical ? "var(--destructive)" : isLow ? "var(--warning)" : "var(--accent)"

  return (
    <div
      className={cn("w-full rounded px-4 py-2 text-sm font-medium transition-all relative overflow-hidden", className)}
      style={{
        backgroundColor: bgColor,
        color: isCritical || isLow ? "white" : "var(--accent-foreground)",
      }}
    >
      <div className="flex items-center justify-between relative z-10">
        <span>Credits</span>
        <span>{Math.round(percentage)}%</span>
      </div>
      <div
        className="absolute inset-0 rounded opacity-30 transition-all duration-300"
        style={{
          width: `${percentage}%`,
          backgroundColor: "rgba(255, 255, 255, 0.2)",
        }}
      />
    </div>
  )
}

export { CreditsGauge }
