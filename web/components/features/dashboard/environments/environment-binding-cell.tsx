"use client"

import type { DataBlobRow, EnvironmentRow } from "@/components/features/dashboard-model"
import { Badge } from "@/components/ui/badge"
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
            <Badge variant="dashboard-data">Primary synced data</Badge>
          ) : null}

          {environment.bound_data_ids.map((dataId) => {
            const blob = dataBlobsById.get(dataId)
            return (
              <div key={`${environment.environment_id}-${dataId}`} className="flex max-w-full items-center gap-1">
                <Badge variant="dashboard-data">{blob?.filename || "Unnamed dataset"}</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="compact-xs"
                  className="border border-border"
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
            variant="dashboard-binding"
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
