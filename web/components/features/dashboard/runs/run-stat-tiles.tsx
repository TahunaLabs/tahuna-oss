import { type RunDetail } from "@/components/features/dashboard-model"
import { formatRunUptime } from "@/components/features/dashboard/runs/run-table-row"
import { Card } from "@/components/ui/card"

type RunStatTilesProps = {
  run: RunDetail
  environmentLabel?: string
}

/** At-a-glance run facts. Shared by the inline run panel and the standalone run page. */
export function RunStatTiles({ run, environmentLabel }: RunStatTilesProps) {
  const tiles = [
    { label: "Status", value: run.status, detail: "Lifecycle state" },
    { label: "Duration", value: formatRunUptime(run.uptime_ms), detail: "Compute time" },
    { label: "Environment", value: environmentLabel ?? "—", detail: "Training environment" },
    {
      label: "Compute",
      value: `${run.effective_gpu_type || "-"} ×${run.effective_gpu_count || "-"}`,
      detail: `${run.effective_volume_gb || "-"}GB volume`,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label} variant="surface" className="p-4">
          <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{tile.label}</p>
          <p className="mt-2 truncate text-lg font-semibold text-foreground">{tile.value}</p>
          <p className="mt-1 text-ui-caption text-muted-foreground">{tile.detail}</p>
        </Card>
      ))}
    </div>
  )
}
