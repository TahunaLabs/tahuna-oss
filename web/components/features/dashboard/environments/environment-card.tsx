"use client"

import { Users } from "lucide-react"

import {
  type DataBlobRow,
  type EnvironmentRow,
  relativeTime,
} from "@/components/features/dashboard-model"
import { EnvironmentActionsMenu } from "@/components/features/dashboard/environments/environment-actions-menu"
import { EnvironmentConfigPanel } from "@/components/features/dashboard/environments/environment-config-panel"
import { GridBoundDataPreview } from "@/components/features/dashboard/environments/grid-bound-data-preview"
import { Card } from "@/components/ui/card"

type EnvironmentCardProps = {
  environment: EnvironmentRow
  dataBlobsById: ReadonlyMap<string, DataBlobRow>
  isShared: boolean
  configOpen: boolean
  configName: string
  configDraft: string
  configSourceText: string
  configError: string
  configLoading: boolean
  configSaving: boolean
  busy: boolean
  onCloseConfigEditor: () => void
  onDeleteEnvironments: (ids: EnvironmentRow["environment_id"][]) => Promise<boolean>
  onLaunchRun: (id: EnvironmentRow["environment_id"]) => void
  onOpenConfigEditor: (environment: EnvironmentRow) => void
  onShareEnvironment?: (id: string) => void
  onConfigDraftChange: (value: string) => void
  onCancelConfigEdit: () => void
  onSaveConfig: (id: EnvironmentRow["environment_id"]) => void
}

function formatGpuLabel(gpuType: string) {
  return (
    gpuType
      .replace(/^nvidia\s+geforce\s+/i, "")
      .replace(/^nvidia\s+/i, "")
      .replace(/^amd\s+radeon\s+/i, "")
      .replace(/^amd\s+/i, "")
      .replace(/^intel\s+/i, "")
      .trim() || gpuType
  )
}

function deviceLabel(environment: Pick<EnvironmentRow, "gpu_type" | "gpu_count" | "volume_gb">) {
  return `${formatGpuLabel(environment.gpu_type)} x${environment.gpu_count} · ${environment.volume_gb}GB`
}

function EnvironmentCard({
  environment,
  dataBlobsById,
  isShared,
  configOpen,
  configName,
  configDraft,
  configSourceText,
  configError,
  configLoading,
  configSaving,
  busy,
  onCloseConfigEditor,
  onDeleteEnvironments,
  onLaunchRun,
  onOpenConfigEditor,
  onShareEnvironment,
  onConfigDraftChange,
  onCancelConfigEdit,
  onSaveConfig,
}: EnvironmentCardProps) {
  return (
    <Card variant="dashboard-surface" className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm text-foreground">{environment.name}</p>
            {isShared ? <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {environment.framework}:{environment.version}
          </p>
          <p className="truncate text-xs text-muted-foreground">{deviceLabel(environment)}</p>
          <p className="truncate text-xs text-muted-foreground">
            {isShared ? "Shared" : "Private"} · Updated {relativeTime(environment.last_updated_at)}
          </p>
        </div>

        <EnvironmentActionsMenu
          environment={environment}
          busy={busy}
          configOpen={configOpen}
          configSaving={configSaving}
          onCloseConfigEditor={onCloseConfigEditor}
          onDeleteEnvironments={onDeleteEnvironments}
          onLaunchRun={onLaunchRun}
          onOpenConfigEditor={onOpenConfigEditor}
          onShareEnvironment={onShareEnvironment}
        />
      </div>

      <GridBoundDataPreview environment={environment} dataBlobsById={dataBlobsById} />

      {configOpen ? (
        <div className="mt-4">
          <EnvironmentConfigPanel
            environmentId={environment.environment_id}
            configName={configName}
            configDraft={configDraft}
            configSourceText={configSourceText}
            configError={configError}
            configLoading={configLoading}
            configSaving={configSaving}
            onClose={onCloseConfigEditor}
            onDraftChange={onConfigDraftChange}
            onCancel={onCancelConfigEdit}
            onSave={onSaveConfig}
          />
        </div>
      ) : null}
    </Card>
  )
}

export { EnvironmentCard, deviceLabel, formatGpuLabel }
