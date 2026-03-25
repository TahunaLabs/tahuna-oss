import type * as React from "react"

import {
  Sidebar as AppSidebar,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

type DashboardAppLayoutProps = {
  sidebar: React.ReactNode
  children: React.ReactNode
}

function DashboardAppLayout({
  sidebar,
  children,
}: DashboardAppLayoutProps) {
  return (
    <SidebarProvider className="h-screen">
      <AppSidebar collapsible="icon">
        {sidebar}
      </AppSidebar>
      <SidebarInset id="main-content" className="overflow-y-auto border-l-0 pt-10">
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

export { DashboardAppLayout }
