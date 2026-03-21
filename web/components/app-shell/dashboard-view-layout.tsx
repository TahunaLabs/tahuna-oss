import type * as React from "react"

import { DashboardSectionHeader } from "@/components/ui/dashboard-section-header"

type DashboardViewLayoutProps = {
  sectionLabel: string
  title: string
  titleIcon?: React.ReactNode
  count?: number
  rightContent?: React.ReactNode
  toolbar: React.ReactNode
  children: React.ReactNode
}

function DashboardViewLayout({
  sectionLabel,
  title,
  titleIcon,
  count,
  rightContent,
  toolbar,
  children,
}: DashboardViewLayoutProps) {
  return (
    <section aria-label={sectionLabel} className="flex flex-col pb-6 pt-4">
      <DashboardSectionHeader
        title={title}
        icon={titleIcon}
        count={count}
        rightContent={rightContent}
      />
      <div className="pb-4">
        {toolbar}
      </div>
      {children}
    </section>
  )
}

export { DashboardViewLayout }
