"use client"

import type { DataBlobRow, EnvironmentRow } from "@/components/features/dashboard-model"
import { Badge } from "@/components/ui/badge"

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
        <Badge variant="data">Primary synced data</Badge>
      ) : null}

      {environment.bound_data_ids.slice(0, 2).map((dataId) => {
        const blob = dataBlobsById.get(dataId)
        return (
          <Badge key={`${environment.environment_id}-grid-${dataId}`} variant="data">
            {blob?.filename || "Unnamed dataset"}
          </Badge>
        )
      })}

      {environment.bound_data_ids.length > 2 ? (
        <Badge variant="data" className="text-muted-foreground">
          +{environment.bound_data_ids.length - 2}
        </Badge>
      ) : null}
    </div>
  )
}

export { GridBoundDataPreview }
