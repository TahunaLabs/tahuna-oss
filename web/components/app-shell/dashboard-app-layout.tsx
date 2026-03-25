"use client"

import type * as React from "react"
import { GitHubLogoIcon } from "@radix-ui/react-icons"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"
import { LINKS_CONFIG } from "@/config"
import {
  Sidebar as AppSidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

type DashboardAppLayoutProps = {
  sidebar: React.ReactNode
  children: React.ReactNode
}

function DashboardAppLayout({
  sidebar,
  children,
}: DashboardAppLayoutProps) {
  const { theme, setTheme } = useTheme()

  return (
    <SidebarProvider className="h-screen">
      <AppSidebar collapsible="icon">
        {sidebar}
      </AppSidebar>
      <SidebarInset id="main-content" className="overflow-y-auto border-l-0 flex flex-col">
        <header className="flex h-16 items-center border-b bg-background px-6 gap-2">
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
        <main className="flex-1">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export { DashboardAppLayout }
