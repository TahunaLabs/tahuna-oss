import { StatusDot, type StatusDotVariant } from '@/components/ui/status-dot'
import { cn } from '@/lib/utils'

function Eyebrow({
  variant = 'cancelling',
  className,
  children,
}: {
  variant?: StatusDotVariant
  className?: string
  children: React.ReactNode
}) {
  return (
    <div data-slot="eyebrow" className={cn('flex items-center gap-2', className)}>
      <StatusDot variant={variant} size="sm" />
      <span className="font-medium text-ui-caption tracking-ui-eyebrow uppercase text-foreground">
        {children}
      </span>
    </div>
  )
}

export { Eyebrow }
