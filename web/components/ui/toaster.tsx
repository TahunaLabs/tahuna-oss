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
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-md group-[.toaster]:border group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-sm group-[.toaster]:text-sm group-[.toaster]:font-sans",
          description: "group-[.toast]:text-muted-foreground",
          error:
            "group-[.toaster]:border-destructive/30 group-[.toaster]:bg-destructive/10 group-[.toaster]:text-destructive",
          success:
            "group-[.toaster]:border-border group-[.toaster]:bg-muted/40 group-[.toaster]:text-foreground",
          closeButton: "group-[.toaster]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
