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

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-muted-foreground">Credits available</p>
        <p className={cn("text-sm font-medium", {
          "text-destructive": isCritical,
          "text-warning": isLow && !isCritical,
          "text-foreground": !isLow,
        })}>
          {formatMoney(balanceCents, currency)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-300", {
              "bg-destructive": isCritical,
              "bg-warning": isLow && !isCritical,
              "bg-success": !isLow,
            })}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground min-w-fit">
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  )
}

export { CreditsGauge }
