import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const selectVariants = cva(
  'h-10 w-full min-w-0 appearance-none rounded-lg border border-border bg-card px-4 py-2 text-sm font-mono text-foreground/80 transition-[color,box-shadow,border-color] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
  {
    variants: {
      variant: {
        default: '',
        dashboard:
          'h-dashboard-control rounded-lg border-border bg-card px-3.5 font-sans text-dashboard-control text-foreground',
        'dashboard-binding':
          'h-auto flex-1 rounded border-border bg-muted px-2 py-1 font-sans text-dashboard-control-small text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Select({
  className,
  variant,
  ...props
}: React.ComponentProps<'select'> & VariantProps<typeof selectVariants>) {
  return (
    <select
      data-slot="select"
      className={cn(selectVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Select, selectVariants }
