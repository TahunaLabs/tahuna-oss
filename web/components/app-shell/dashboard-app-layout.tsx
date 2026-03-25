import type * as React from "react"

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
  return (
    <SidebarProvider className="h-screen">
      <AppSidebar collapsible="icon">
        {sidebar}
      </AppSidebar>
      <SidebarInset id="main-content" className="overflow-y-auto border-l-0 flex flex-col">
        <header className="flex h-16 items-center border-b bg-background px-6 gap-2">
          <SidebarTrigger />
        </header>
        <main className="flex-1">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export { DashboardAppLayout }
