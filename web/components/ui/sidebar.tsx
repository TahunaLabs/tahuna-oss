import * as React from "react"

import { cn } from "@/lib/utils"

function SidebarProvider({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-screen w-full bg-background", className)}
      {...props}
    />
  )
}

const Sidebar = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"aside">
>(({ className, ...props }, ref) => {
  return (
    <aside
      ref={ref}
      className={cn(
        "w-56 shrink-0 border-r border-sidebar-border bg-sidebar min-[1025px]:w-60",
        className,
      )}
      {...props}
    />
  )
})
Sidebar.displayName = "Sidebar"

const SidebarInset = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"main">
>(({ className, ...props }, ref) => {
  return (
    <main
      ref={ref}
      className={cn("min-h-0 min-w-0 flex-1", className)}
      {...props}
    />
  )
})
SidebarInset.displayName = "SidebarInset"

export { Sidebar, SidebarInset, SidebarProvider }
