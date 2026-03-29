"use client"

import { Toaster as Sonner } from "sonner"
import type { ComponentProps } from "react"

import { useTheme } from "@/components/theme-provider"

type ToasterProps = Omit<ComponentProps<typeof Sonner>, "theme">

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      position="bottom-center"
      className="toaster group"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group toast flex w-[356px] items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 font-sans text-sm text-foreground shadow-sm",
          title: "font-medium",
          description: "text-muted-foreground text-sm",
          error: "border-destructive text-destructive",
          success: "border-success text-success",
          warning: "border-warning text-warning",
          info: "border-accent text-accent",
          closeButton:
            "absolute top-1 right-1 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground",
          actionButton:
            "ml-auto shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground",
          cancelButton:
            "ml-auto shrink-0 rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
