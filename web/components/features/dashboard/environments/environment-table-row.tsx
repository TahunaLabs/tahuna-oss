"use client"

import { Fragment } from "react"

import {
  type DataBlobRow,
  type EnvironmentRow,
  relativeTime,
} from "@/components/features/dashboard-model"
import { TableActionsCell } from "@/components/features/dashboard/table-actions-cell"
import { TableSelectCell } from "@/components/features/dashboard/table-select-cell"
import { EnvironmentActionsMenu } from "@/components/features/dashboard/environments/environment-actions-menu"
import { EnvironmentBindingCell } from "@/components/features/dashboard/environments/environment-binding-cell"
import { EnvironmentConfigPanel } from "@/components/features/dashboard/environments/environment-config-panel"
import { deviceLabel } from "@/components/features/dashboard/environments/environment-card"
import { TableCell, TableRow } from "@/components/ui/table"
import { TruncatedTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

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
  selected: boolean
  onToggleSelected: (environmentId: EnvironmentRow["environment_id"]) => void
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
  selected,
  onToggleSelected,
}: EnvironmentTableRowProps) {
  return (
    <Fragment>
      <TableRow
        className={cn(
          "group align-middle hover:bg-muted",
          selected ? "bg-secondary-faint" : "",
        )}
      >
        <TableSelectCell
          checked={selected}
          ariaLabel={`Select environment ${environment.name}`}
          onCheckedChange={() => onToggleSelected(environment.environment_id)}
        />

        <TableCell className="text-foreground">
          <TruncatedTooltip>{environment.name}</TruncatedTooltip>
        </TableCell>

        <TableCell className="text-muted-foreground">
          <p className="truncate">{isShared ? "Shared" : "Private"}</p>
        </TableCell>

        <TableCell className="min-w-0 pl-3 pr-1">
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
          <TruncatedTooltip tooltip={`${environment.gpu_type} x${environment.gpu_count} · ${environment.volume_gb}GB`}>
            {deviceLabel(environment)}
          </TruncatedTooltip>
        </TableCell>

        <TableCell className="text-muted-foreground">
          <TruncatedTooltip>{`${environment.framework}:${environment.version}`}</TruncatedTooltip>
        </TableCell>

        <TableCell className="text-muted-foreground">
          <p className="truncate">{relativeTime(environment.last_updated_at)}</p>
        </TableCell>

        <TableCell className="hidden text-muted-foreground xl:table-cell">
          <p className="truncate">{relativeTime(environment.created_at)}</p>
        </TableCell>

        <TableActionsCell>
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
        </TableActionsCell>
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
