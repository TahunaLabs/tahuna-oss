"use client"

import type { DataBlobRow, EnvironmentRow } from "@/components/dashboard/shared"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"

type EnvironmentBindingCellProps = {
  environment: EnvironmentRow
  uniqueDataBlobs: DataBlobRow[]
  dataBlobsById: ReadonlyMap<string, DataBlobRow>
  bindSelectionByEnvironment: Record<string, string>
  busy: boolean
  onBindSelectionChange: (environmentId: string, value: string) => void
  onBindSelectedData: (environment: EnvironmentRow, dataId: string) => void
  onUnbindData: (environmentId: EnvironmentRow["environment_id"], dataId: string) => void
}

function EnvironmentBindingCell({
  environment,
  uniqueDataBlobs,
  dataBlobsById,
  bindSelectionByEnvironment,
  busy,
  onBindSelectionChange,
  onBindSelectedData,
  onUnbindData,
}: EnvironmentBindingCellProps) {
  const availableDataBlobs = uniqueDataBlobs.filter(
    (blob) => !environment.bound_data_ids.includes(blob.blob_id),
  )
  const hasPrimaryData = Boolean(environment.latest_data_manifest_hash)
  const hasAnyData = hasPrimaryData || environment.bound_data_ids.length > 0

  return (
    <div className="min-w-0 space-y-1">
      {hasAnyData ? (
        <div className="flex flex-wrap items-center gap-1">
          {hasPrimaryData ? (
            <span className="inline-flex max-w-full truncate rounded bg-secondary px-2 py-0.5 text-xs text-foreground">
              Primary synced data
            </span>
          ) : null}

          {environment.bound_data_ids.map((dataId) => {
            const blob = dataBlobsById.get(dataId)
            return (
              <div key={`${environment.environment_id}-${dataId}`} className="flex max-w-full items-center gap-1">
                <span className="inline-flex max-w-40 truncate rounded bg-secondary px-2 py-0.5 text-xs text-foreground">
                  {blob?.filename || "Unnamed dataset"}
                </span>
                <Button
                  type="button"
                  variant="dashboard-outline-compact-muted"
                  size="none"
                  onClick={() => onUnbindData(environment.environment_id, dataId)}
                  disabled={busy}
                >
                  Unbind
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex min-w-0 items-center gap-1.5">
          <Select
            variant="dashboard"
            value={bindSelectionByEnvironment[environment.environment_id] || ""}
            onChange={(event) => {
              const nextValue = event.target.value.trim()
              onBindSelectionChange(environment.environment_id, nextValue)
              if (!nextValue) {
                return
              }
              onBindSelectedData(environment, nextValue)
            }}
            disabled={busy || availableDataBlobs.length === 0}
            className="h-6 min-w-0 flex-1 bg-secondary/50 px-2 text-[var(--dashboard-control-font-size-small)] leading-[var(--dashboard-control-line-height-small)]"
          >
            <option value="">
              {availableDataBlobs.length === 0 ? "No datasets available" : "Select dataset"}
            </option>
            {availableDataBlobs.map((blob) => (
              <option key={`${environment.environment_id}-opt-${blob.blob_id}`} value={blob.blob_id}>
                {blob.filename}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  )
}

export { EnvironmentBindingCell }
