import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const selectVariants = cva(
  'h-8 w-full min-w-0 appearance-none rounded-lg border border-border bg-card px-3.5 py-2 font-sans text-sm text-foreground transition-[color,box-shadow,border-color] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
  {
    variants: {
      variant: {
        default: '',
        binding:
          'h-auto flex-1 rounded border-border bg-muted px-2 py-1 text-xs text-foreground',
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
