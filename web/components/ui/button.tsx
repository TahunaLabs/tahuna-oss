import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border border-border bg-card text-foreground shadow-none hover:bg-muted',
        secondary:
          'bg-secondary text-foreground hover:bg-muted',
        ghost:
          'text-muted-foreground hover:bg-secondary hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        nav:
          'h-dashboard-control w-full justify-start gap-2 rounded-lg px-2 text-ui-control font-normal text-muted-foreground hover:bg-muted hover:text-foreground data-[active=true]:bg-secondary data-[active=true]:font-medium data-[active=true]:text-foreground',
        tab:
          'h-dashboard-control rounded px-3 text-dashboard-control font-normal tracking-normal text-foreground hover:bg-secondary-hover data-[active=true]:bg-secondary',
        toggle:
          'h-dashboard-control min-w-9 rounded-md border border-transparent px-2 text-muted-foreground hover:bg-secondary hover:text-foreground data-[active=true]:border-border data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-xs',
        'compact-toggle':
          'border border-border text-foreground hover:bg-secondary data-[active=true]:border-accent data-[active=true]:bg-accent data-[active=true]:text-accent-foreground',
        'context-toggle':
          'h-auto w-full items-center justify-between rounded-lg border border-border bg-background/60 px-4 py-3 text-left font-normal hover:bg-secondary/30',
        'sidebar-brand':
          'h-auto justify-start gap-2 rounded px-1.5 py-1 text-sm font-medium text-sidebar-foreground hover:bg-secondary-hover',
        'sidebar-icon':
          'rounded p-1.5 text-foreground hover:bg-secondary-hover',
        'sidebar-menu-item':
          'h-auto w-full justify-start gap-2 rounded-none px-3 py-2 text-sm font-normal text-foreground hover:bg-secondary',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
        none: '',
        control: 'h-dashboard-control rounded-lg px-3 text-dashboard-control',
        compact: 'h-auto rounded px-4 py-2 text-sm',
        'compact-sm': 'h-auto rounded px-3 py-1.5 text-sm',
        'compact-xs': 'h-auto rounded px-2 py-1 text-xs',
        'icon-control': 'h-dashboard-control w-dashboard-control rounded-md p-0',
        'icon-sm': 'h-6 w-6 rounded p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
