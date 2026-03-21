"use client"

import type { DataBlobRow, EnvironmentRow } from "@/components/dashboard/shared"

type GridBoundDataPreviewProps = {
  environment: EnvironmentRow
  dataBlobsById: ReadonlyMap<string, DataBlobRow>
}

function GridBoundDataPreview({
  environment,
  dataBlobsById,
}: GridBoundDataPreviewProps) {
  const hasPrimaryData = Boolean(environment.latest_data_manifest_hash)

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      {hasPrimaryData ? (
        <span className="inline-flex max-w-full truncate rounded bg-secondary px-2 py-0.5 text-xs text-foreground">
          Primary synced data
        </span>
      ) : null}

      {environment.bound_data_ids.slice(0, 2).map((dataId) => {
        const blob = dataBlobsById.get(dataId)
        return (
          <span
            key={`${environment.environment_id}-grid-${dataId}`}
            className="inline-flex max-w-full truncate rounded bg-secondary px-2 py-0.5 text-xs text-foreground"
          >
            {blob?.filename || "Unnamed dataset"}
          </span>
        )
      })}

      {environment.bound_data_ids.length > 2 ? (
        <span className="inline-flex rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
          +{environment.bound_data_ids.length - 2}
        </span>
      ) : null}
    </div>
  )
}

export { GridBoundDataPreview }
