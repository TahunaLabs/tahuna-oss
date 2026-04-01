"use client"

import { Rocket } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { DashboardTable } from "@/components/features/dashboard/dashboard-table"
import {
  type EnvironmentRow,
  type ServeLogsOnlyDetail,
  type ServeRow,
} from "@/components/features/dashboard-model"
import { ServeDetailPanel } from "@/components/features/dashboard/serving/serve-detail-panel"
import { ServingEmptyState } from "@/components/features/dashboard/serving/serving-empty-state"
import { ServeTableRow } from "@/components/features/dashboard/serving/serve-table-row"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { TableHead } from "@/components/ui/table"

type ServingViewProps = {
  environments: EnvironmentRow[] | undefined
  serves: ServeRow[] | undefined
  busy: boolean
  selectedServeId: string | null
  serveLogs: ServeLogsOnlyDetail | undefined
  loading: boolean
  onSelectServe: (serveId: string | null) => void
  onStopServe: (serveId: ServeRow["serve_id"]) => void
}

export function ServingView({
  environments,
  serves,
  busy,
  selectedServeId,
  serveLogs,
  loading,
  onSelectServe,
  onStopServe,
}: ServingViewProps) {
  const environmentNameById = new Map((environments ?? []).map((environment) => [String(environment.environment_id), environment.name]))
  const selectedServe = (serves ?? []).find((serve) => serve.serve_id === selectedServeId) ?? null

  return (
    <DashboardViewLayout
      sectionLabel="Serving"
      title="Serving"
      titleIcon={<Rocket size={24} />}
      count={serves && serves.length > 0 ? serves.length : undefined}
      toolbar={null}
    >
      {loading ? (
        <Card variant="ghost" className="flex min-h-72 flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-muted-foreground">Loading serves…</p>
        </Card>
      ) : (serves ?? []).length === 0 ? (
        <ServingEmptyState />
      ) : (
        <div className="space-y-3">
          <DashboardTable
            columns={[
              { role: "main" },
              { role: "meta" },
              { role: "main" },
              { role: "meta" },
              { role: "meta" },
            ]}
            headerCells={(
              <>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Compute</TableHead>
                <TableHead>Created</TableHead>
              </>
            )}
            pagination={{
              total: serves?.length ?? 0,
              offset: 0,
              count: serves?.length ?? 0,
              hasPrevious: false,
              hasNext: false,
            }}
          >
            {(serves ?? []).map((serve) => (
              <ServeTableRow
                key={serve.serve_id}
                serve={serve}
                environmentLabel={environmentNameById.get(serve.environment_id) ?? "Unknown environment"}
                selected={selectedServeId === serve.serve_id}
                onSelectServe={onSelectServe}
              />
            ))}
          </DashboardTable>

          {selectedServe ? (
            <ServeDetailPanel
              serve={selectedServe}
              environmentLabel={environmentNameById.get(selectedServe.environment_id) ?? "Unknown environment"}
              serveLogs={serveLogs}
              busy={busy}
              onSelectServe={onSelectServe}
              onStopServe={onStopServe}
            />
          ) : null}
        </div>
      )}
    </DashboardViewLayout>
  )
}
