import type * as React from "react"

import {
  Sidebar as AppSidebar,
  SidebarProvider,
} from "@/components/ui/sidebar"

type DashboardAppLayoutProps = {
  sidebar: React.ReactNode
  topBar: React.ReactNode
  children: React.ReactNode
}

function DashboardAppLayout({
  sidebar,
  topBar,
  children,
}: DashboardAppLayoutProps) {
  return (
    <SidebarProvider className="relative h-full overflow-hidden">
      <AppSidebar collapsible="icon">
        {sidebar}
      </AppSidebar>
      <div className="flex-1 grid" style={{ gridTemplateRows: "auto 1fr" }}>
        {topBar}
        <main id="main-content" className="overflow-y-auto">
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}

export { DashboardAppLayout }
