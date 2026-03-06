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
        sidebar:
          'w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/70 hover:bg-secondary/60 hover:text-foreground',
        'sidebar-active':
          'w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/10',
        'sidebar-danger':
          'w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm text-rose-300/80 hover:bg-rose-900/20 hover:text-rose-200',
        'dashboard-nav':
          'h-8 w-full justify-start gap-2.5 px-2 text-[13.5px] font-normal text-[#6e6e80] hover:bg-[#f4f4f4] hover:text-[#0d0d0d] dark:text-[#8ca7a5] dark:hover:bg-[#153235] dark:hover:text-[#d8e6df]',
        'dashboard-nav-active':
          'h-8 w-full justify-start gap-2.5 px-2 text-left text-[13.5px] font-medium bg-[#ececec] text-[#0d0d0d] dark:bg-[#1a3d40] dark:text-[#d8ebe8]',
        'dashboard-logout':
          'h-8 w-full justify-start gap-2.5 px-2 text-[13px] font-normal text-[#6e6e80] hover:bg-[#f4f4f4] hover:text-[#0d0d0d] dark:text-[#8ca7a5] dark:hover:bg-[#153235] dark:hover:text-[#d8e6df]',
        'dashboard-top-link':
          'h-auto px-0 text-[13.5px] font-normal text-[#6e6e80] hover:bg-transparent hover:text-[#0d0d0d] dark:text-[#8ca7a5] dark:hover:text-[#d8e6df]',
        'dashboard-icon':
          'h-[30px] w-[30px] p-0 text-[#6e6e80] hover:bg-[#f4f4f4] hover:text-[#0d0d0d] dark:text-[#8ca7a5] dark:hover:bg-[#153235] dark:hover:text-[#d8e6df]',
        'dashboard-primary':
          'bg-[#0d0d0d] text-white hover:bg-[#222] dark:bg-[#2a8f8e] dark:text-[#eaf7f6] dark:hover:bg-[#247a79]',
        'dashboard-outline':
          'h-8 border border-[#e5e5e5] bg-white text-[#0d0d0d] shadow-none hover:bg-[#f8f8f8] dark:border-[#275156] dark:bg-[#102729] dark:text-[#d8e6df] dark:hover:bg-[#173337]',
        'dashboard-outline-icon':
          'h-8 border border-[#e5e5e5] bg-white px-2 text-[#0d0d0d] shadow-none hover:bg-[#f8f8f8] dark:border-[#275156] dark:bg-[#102729] dark:text-[#d8e6df] dark:hover:bg-[#173337]',
        'dashboard-tab':
          'h-9 rounded-md border border-[#e5e5e5] bg-white text-xs tracking-[0.1em] text-[#6e6e80] shadow-none hover:bg-[#f8f8f8] disabled:opacity-45 dark:border-[#275156] dark:bg-[#102729] dark:text-[#8fb2af] dark:hover:bg-[#153235]',
        'dashboard-tab-active':
          'h-9 rounded-md border border-[#e5e5e5] bg-[#f4f4f4] text-xs tracking-[0.1em] text-[#0d0d0d] shadow-none hover:bg-[#f0f0f0] disabled:opacity-45 dark:border-[#2f6668] dark:bg-[#1a3d40] dark:text-[#d8ebe8] dark:hover:bg-[#20484b]',
        'dashboard-machine-trigger':
          'h-auto w-full justify-between gap-4 rounded-lg border border-[#e5e5e5] bg-white px-4 py-3 text-left font-normal text-[#0d0d0d] shadow-none hover:bg-[#f8f8f8] disabled:opacity-60 dark:border-[#275156] dark:bg-[#102729] dark:text-[#d8e6df] dark:hover:bg-[#173337]',
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
