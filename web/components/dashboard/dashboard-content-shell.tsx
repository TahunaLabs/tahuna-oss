import type * as React from "react"

function DashboardContentShell({
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-content-shell"
      className="dashboard-content-shell"
      {...props}
    />
  )
}

export { DashboardContentShell }
