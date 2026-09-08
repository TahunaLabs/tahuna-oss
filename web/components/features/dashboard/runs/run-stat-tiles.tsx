import { type RunDetail } from "@/components/features/dashboard-model"
import { formatRunUptime } from "@/components/features/dashboard/runs/run-table-row"
import { Card } from "@/components/ui/card"

type RunStatTilesProps = {
  run: RunDetail
  environmentLabel?: string
}

export function RunStatTiles({ run, environmentLabel }: RunStatTilesProps) {
  const tiles: Array<{ label: string; value: string; detail?: string }> = [
    { label: "Status", value: run.status },
    { label: "Duration", value: formatRunUptime(run.uptime_ms) },
    { label: "Environment", value: environmentLabel ?? "—" },
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
          {tile.detail ? <p className="mt-1 text-ui-caption text-muted-foreground">{tile.detail}</p> : null}
        </Card>
      ))}
    </div>
  )
}
