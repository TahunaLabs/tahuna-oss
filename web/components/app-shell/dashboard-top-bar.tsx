"use client"

import type * as React from "react"
import { GitHubLogoIcon } from "@radix-ui/react-icons"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { LINKS_CONFIG } from "@/config"

function DashboardTopBar(props: React.ComponentProps<"header">) {
  const { theme, setTheme } = useTheme()

  return (
    <header
      data-slot="dashboard-top-bar"
      className="flex h-16 shrink-0 items-center bg-background px-6 gap-2"
      {...props}
    >
      <SidebarTrigger />
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" asChild>
          <a
            href={LINKS_CONFIG.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
          >
            <GitHubLogoIcon className="size-4" />
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

export { DashboardTopBar }
