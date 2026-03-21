import type * as React from "react"

type DashboardAppLayoutProps = {
  sidebar: React.ReactNode
  children: React.ReactNode
}

function DashboardAppLayout({
  sidebar,
  children,
}: DashboardAppLayoutProps) {
  return (
    <div data-slot="dashboard-app-layout" className="dashboard-app-layout">
      <a href="#main-content" className="dashboard-skip-link">
        Skip to content
      </a>
      <div data-slot="dashboard-app-sidebar" className="dashboard-app-layout__sidebar">
        {sidebar}
      </div>
      <main id="main-content" data-slot="dashboard-app-main" className="dashboard-app-layout__main">
        {children}
      </main>
    </div>
  )
}

export { DashboardAppLayout }
