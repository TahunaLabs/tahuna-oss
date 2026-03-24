"use client"

import { Fragment } from "react"

import {
  type DataBlobRow,
  type EnvironmentRow,
  relativeTime,
} from "@/components/features/dashboard-model"
import { EnvironmentActionsMenu } from "@/components/features/dashboard/environments/environment-actions-menu"
import { EnvironmentBindingCell } from "@/components/features/dashboard/environments/environment-binding-cell"
import { EnvironmentConfigPanel } from "@/components/features/dashboard/environments/environment-config-panel"
import { deviceLabel } from "@/components/features/dashboard/environments/environment-card"
import { TableCell, TableRow } from "@/components/ui/table"

type EnvironmentTableRowProps = {
  environment: EnvironmentRow
  uniqueDataBlobs: DataBlobRow[]
  dataBlobsById: ReadonlyMap<string, DataBlobRow>
  bindSelectionByEnvironment: Record<string, string>
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
  onBindSelectionChange: (environmentId: string, value: string) => void
  onBindSelectedData: (environment: EnvironmentRow, dataId: string) => void
  onUnbindData: (environmentId: EnvironmentRow["environment_id"], dataId: string) => void
}

function EnvironmentTableRow({
  environment,
  uniqueDataBlobs,
  dataBlobsById,
  bindSelectionByEnvironment,
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
  onBindSelectionChange,
  onBindSelectedData,
  onUnbindData,
}: EnvironmentTableRowProps) {
  return (
    <Fragment>
      <TableRow className="group align-middle hover:bg-muted">
        <TableCell className="px-0" />

        <TableCell className="text-foreground">
          <p className="truncate">{environment.name}</p>
        </TableCell>

        <TableCell className="hidden text-muted-foreground lg:table-cell">
          <p className="truncate">{isShared ? "Shared" : "Private"}</p>
        </TableCell>

        <TableCell className="overflow-hidden pl-3 pr-1">
          <EnvironmentBindingCell
            environment={environment}
            uniqueDataBlobs={uniqueDataBlobs}
            dataBlobsById={dataBlobsById}
            bindSelectionByEnvironment={bindSelectionByEnvironment}
            busy={busy}
            onBindSelectionChange={onBindSelectionChange}
            onBindSelectedData={onBindSelectedData}
            onUnbindData={onUnbindData}
          />
        </TableCell>

        <TableCell className="text-muted-foreground">
          <p
            className="truncate"
            title={`${environment.gpu_type} x${environment.gpu_count} · ${environment.volume_gb}GB`}
          >
            {deviceLabel(environment)}
          </p>
        </TableCell>

        <TableCell className="text-muted-foreground">
          <p className="truncate" title={`${environment.framework}:${environment.version}`}>
            {environment.framework}:{environment.version}
          </p>
        </TableCell>

        <TableCell className="text-muted-foreground">
          <p className="truncate">{relativeTime(environment.last_updated_at)}</p>
        </TableCell>

        <TableCell className="hidden text-muted-foreground xl:table-cell">
          <p className="truncate">{relativeTime(environment.created_at)}</p>
        </TableCell>

        <TableCell className="px-0 align-middle">
          <div className="flex items-center justify-center">
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
        </TableCell>
      </TableRow>

      {configOpen ? (
        <TableRow className="bg-secondary-subtle">
          <TableCell colSpan={9} className="px-6 pb-4 pt-1">
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
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  )
}

export { EnvironmentTableRow }
