import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

function Eyebrow({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div data-slot="eyebrow" className={cn('flex items-center gap-3', className)}>
      <Separator className="data-[orientation=horizontal]:w-8" />
      <span className="font-medium text-ui-caption tracking-ui-eyebrow uppercase text-muted-foreground">
        {children}
      </span>
    </div>
  )
}

export { Eyebrow }
