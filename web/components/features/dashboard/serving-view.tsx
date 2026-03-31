"use client"

import { Rocket } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { DashboardTable } from "@/components/features/dashboard/dashboard-table"
import {
  relativeTime,
  type EnvironmentRow,
  type ServeSnapshot,
} from "@/components/features/dashboard-model"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { TruncatedTooltip } from "@/components/ui/tooltip"

type SyncedServingEnvironment = EnvironmentRow & {
  serve_snapshot: ServeSnapshot
}

type ServingViewProps = {
  environments: SyncedServingEnvironment[]
  loading: boolean
}

function formatServeCommand(command: string[]) {
  return command.join(" ")
}

function formatServeDevice(snapshot: ServeSnapshot) {
  return `${snapshot.gpu_type} x${snapshot.gpu_count} · ${snapshot.volume_gb}GB`
}

function formatServeEndpoint(snapshot: ServeSnapshot) {
  return `:${snapshot.port}${snapshot.health_path}`
}

export function ServingView({ environments, loading }: ServingViewProps) {
  return (
    <DashboardViewLayout
      sectionLabel="Serving"
      title="Serving"
      titleIcon={<Rocket size={24} />}
      count={environments.length > 0 ? environments.length : undefined}
      toolbar={null}
    >
      {loading ? (
        <Card variant="ghost" className="flex min-h-72 flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-muted-foreground">Loading serving configs…</p>
        </Card>
      ) : environments.length === 0 ? (
        <Card variant="ghost" className="flex min-h-72 items-center justify-center">
          <p className="max-w-md text-center text-sm text-muted-foreground">
            No synced serving configs yet. Run <code>tahuna sync</code> from a project with a configured
            <code> [serve] </code> section.
          </p>
        </Card>
      ) : (
        <DashboardTable
          columns={[
            { role: "main" },
            { role: "main" },
            { role: "meta" },
            { role: "meta" },
            { role: "meta" },
            { role: "main", className: "hidden xl:table-column" },
            { role: "meta" },
          ]}
          headerCells={(
            <>
              <TableHead>Environment</TableHead>
              <TableHead>Command</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Python</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead className="hidden xl:table-cell">Model path</TableHead>
              <TableHead>Last synced</TableHead>
            </>
          )}
          pagination={{
            total: environments.length,
            offset: 0,
            count: environments.length,
            hasPrevious: false,
            hasNext: false,
          }}
        >
          {environments.map((environment) => (
            <TableRow key={environment.environment_id} className="align-middle hover:bg-muted">
              <TableCell className="text-foreground">
                <TruncatedTooltip>{environment.name}</TruncatedTooltip>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <TruncatedTooltip tooltip={formatServeCommand(environment.serve_snapshot.command)}>
                  {formatServeCommand(environment.serve_snapshot.command)}
                </TruncatedTooltip>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <TruncatedTooltip tooltip={formatServeDevice(environment.serve_snapshot)}>
                  {formatServeDevice(environment.serve_snapshot)}
                </TruncatedTooltip>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <p className="truncate">{environment.serve_snapshot.python_version}</p>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <TruncatedTooltip tooltip={formatServeEndpoint(environment.serve_snapshot)}>
                  {formatServeEndpoint(environment.serve_snapshot)}
                </TruncatedTooltip>
              </TableCell>
              <TableCell className="hidden text-muted-foreground xl:table-cell">
                <TruncatedTooltip tooltip={environment.serve_snapshot.default_model_path}>
                  {environment.serve_snapshot.default_model_path}
                </TruncatedTooltip>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <p className="truncate">{relativeTime(environment.last_updated_at)}</p>
              </TableCell>
            </TableRow>
          ))}
        </DashboardTable>
      )}
    </DashboardViewLayout>
  )
}
