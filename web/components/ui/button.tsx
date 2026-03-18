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
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
        pill: 'bg-card border border-border rounded-full text-foreground hover:bg-foreground/5',
        'sidebar-brand':
          'h-auto justify-start gap-2 rounded px-1.5 py-1 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent',
        'sidebar-icon':
          'rounded p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
        'sidebar-workspace':
          'h-auto w-full justify-start gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-sidebar-foreground',
        'sidebar-item':
          'h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-sm font-normal text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground',
        'sidebar-item-active':
          'h-auto w-full justify-start gap-2 rounded px-2 py-1.5 text-sm font-normal bg-sidebar-accent text-sidebar-foreground',
        'sidebar-menu-item':
          'h-auto w-full justify-start gap-2 rounded-none px-3 py-2 text-sm font-normal text-foreground hover:bg-secondary',
        'dashboard-nav':
          'h-7 w-full justify-start gap-2 px-2 text-[13px] font-normal text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg',
        'dashboard-nav-active':
          'h-7 w-full justify-start gap-2 px-2 text-left text-[13px] font-medium bg-secondary text-foreground rounded-lg',
        'dashboard-icon-secondary':
          'rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground',
        'dashboard-icon-secondary-active':
          'rounded bg-secondary p-1.5 text-foreground hover:bg-secondary/80',
        'dashboard-primary':
          'h-8 rounded-lg bg-primary px-3 text-primary-foreground hover:bg-primary/90',
        'dashboard-primary-compact':
          'h-auto rounded bg-accent px-4 py-2 text-sm text-accent-foreground hover:opacity-90',
        'dashboard-primary-compact-sm':
          'h-auto rounded bg-accent px-3 py-1.5 text-sm text-accent-foreground hover:opacity-90',
        'dashboard-outline':
          'h-7 rounded-lg border border-border bg-card px-3 text-foreground shadow-none hover:bg-muted',
        'dashboard-outline-compact':
          'h-auto rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-secondary',
        'dashboard-outline-compact-muted':
          'h-auto rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground',
        'dashboard-outline-compact-gap':
          'h-auto gap-1 rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-secondary',
        'dashboard-outline-icon':
          'h-7 rounded-lg border border-border bg-card px-2 text-foreground shadow-none hover:bg-muted',
        'dashboard-outline-icon-muted':
          'h-6 w-6 rounded p-0 text-muted-foreground hover:bg-secondary hover:text-foreground',
        'dashboard-outline-icon-danger':
          'h-6 w-6 rounded p-0 text-muted-foreground hover:bg-secondary hover:text-destructive-foreground',
        'dashboard-tab-compact':
          'h-auto rounded px-3 py-1.5 text-sm font-normal tracking-normal text-muted-foreground hover:bg-secondary hover:text-foreground',
        'dashboard-tab-compact-active':
          'h-auto rounded bg-secondary px-3 py-1.5 text-sm font-medium tracking-normal text-foreground',
        'dashboard-run-list-item':
          'h-auto w-full flex-col items-start justify-start gap-0 whitespace-normal rounded-none border-b border-border px-4 py-3 text-left transition-colors hover:bg-secondary/50',
        'dashboard-run-list-item-active':
          'h-auto w-full flex-col items-start justify-start gap-0 whitespace-normal rounded-none border-b border-border bg-secondary px-4 py-3 text-left transition-colors hover:bg-secondary/50',
        'dashboard-context-toggle':
          'h-auto w-full items-center justify-between rounded-lg border border-border bg-background/60 px-4 py-3 text-left font-normal hover:bg-secondary/30',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
        none: '',
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
