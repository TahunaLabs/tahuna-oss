"use client"

import Link from "next/link"

import { primarySyncedDataHref, type DataBlobRow, type EnvironmentRow } from "@/components/features/dashboard-model"
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
        <Link href={primarySyncedDataHref(environment.data_id)}>
          <Badge variant="data" className="cursor-pointer hover:opacity-80">Primary synced data</Badge>
        </Link>
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
