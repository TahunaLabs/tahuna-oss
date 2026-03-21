import type * as React from "react"

import { DashboardSectionHeader } from "@/components/ui/dashboard-section-header"
import { DashboardTabsHeader } from "@/components/ui/dashboard-tabs-header"

type DashboardViewLayoutProps = {
  sectionLabel: string
  title: string
  titleIcon?: React.ReactNode
  count?: number
  creditsLabel?: string
  rightContent?: React.ReactNode
  toolbar: React.ReactNode
  children: React.ReactNode
}

function DashboardViewLayout({
  sectionLabel,
  title,
  titleIcon,
  count,
  creditsLabel,
  rightContent,
  toolbar,
  children,
}: DashboardViewLayoutProps) {
  const resolvedRightContent =
    rightContent === undefined
      ? (creditsLabel ? `Credits: ${creditsLabel}` : undefined)
      : rightContent

  return (
    <section aria-label={sectionLabel} className="dashboard-view-layout">
      <div className="dashboard-view-layout__spacer" aria-hidden />
      <DashboardSectionHeader
        title={title}
        icon={titleIcon}
        count={count}
        rightContent={resolvedRightContent}
      />
      <DashboardTabsHeader className="dashboard-view-layout__toolbar">
        {toolbar}
      </DashboardTabsHeader>
      <div className="dashboard-view-layout__content">{children}</div>
    </section>
  )
}

export { DashboardViewLayout }
