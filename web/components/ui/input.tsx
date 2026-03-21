import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const inputVariants = cva(
  'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground h-10 w-full min-w-0 rounded-lg border border-border bg-card px-4 py-2 text-sm font-mono text-foreground/80 transition-[color,box-shadow,border-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
  {
    variants: {
      variant: {
        default: '',
        dashboard:
          'h-[var(--dashboard-control-height)] rounded-lg border-border bg-card px-3.5 font-sans text-[var(--dashboard-control-font-size)] leading-[1.6] text-foreground',
        'dashboard-search':
          'h-[var(--dashboard-control-height)] rounded-lg border-border bg-card pl-9 pr-3.5 font-sans text-[var(--dashboard-control-font-size)] leading-[1.6] text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function Input({
  className,
  type,
  variant,
  ...props
}: React.ComponentProps<'input'> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Input, inputVariants }
