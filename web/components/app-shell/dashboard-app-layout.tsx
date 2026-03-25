import type * as React from "react"

import {
  Sidebar as AppSidebar,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { DashboardTopBar } from "@/components/app-shell/dashboard-top-bar"

type DashboardAppLayoutProps = {
  sidebar: React.ReactNode
  children: React.ReactNode
}

function DashboardAppLayout({
  sidebar,
  children,
}: DashboardAppLayoutProps) {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <AppSidebar collapsible="icon">
        {sidebar}
      </AppSidebar>
      <div className="flex-1 grid" style={{ gridTemplateRows: "auto 1fr" }}>
        <DashboardTopBar />
        <main id="main-content" className="overflow-y-auto">
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}

export { DashboardAppLayout }
