"use client"

import type * as React from "react"
import { Bug, Moon, Search, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { CLOUD_LINKS_CONFIG } from "@/cloud/links"

type CloudDashboardTopBarProps = React.ComponentProps<"header"> & {
  title?: string
  onOpenSearch?: () => void
}

function CloudDashboardTopBar({ title, onOpenSearch, ...props }: CloudDashboardTopBarProps) {
  const { theme, setTheme } = useTheme()

  return (
    <header
      data-slot="dashboard-top-bar"
      className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4 lg:px-6"
      {...props}
    >
      <SidebarTrigger />
      <span aria-hidden className="mx-1 h-4 w-px bg-border" />
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Dashboard</span>
        {title ? (
          <>
            <span aria-hidden className="text-muted-foreground/40">/</span>
            <span className="font-medium text-foreground">{title}</span>
          </>
        ) : null}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          aria-label="Search"
          onClick={onOpenSearch}
          className="hidden w-60 items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted lg:flex"
        >
          <Search className="size-3.5 shrink-0" />
          <span>Search…</span>
          <kbd className="ml-auto rounded border border-border px-1 text-ui-micro">⌘K</kbd>
        </button>
        <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
          <a href={CLOUD_LINKS_CONFIG.docsUrl} target="_blank" rel="noopener noreferrer">
            Docs
          </a>
        </Button>
        <Button variant="ghost" size="icon" asChild>
          <a
            href={CLOUD_LINKS_CONFIG.bugReportUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Report a bug on Linear"
          >
            <Bug className="size-4" />
          </a>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  )
}

export { CloudDashboardTopBar }
