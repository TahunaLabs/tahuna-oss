"use client"

import { X } from "lucide-react"

import { type ServeLogsOnlyDetail, type ServeRow } from "@/components/features/dashboard-model"
import {
  canStopServe,
  formatServeDevice,
  formatServeSnapshotSize,
  formatServeSource,
  formatServeStatus,
  serveStatusDotVariant,
} from "@/components/features/dashboard/serving/serve-presentation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Notice } from "@/components/ui/notice"
import { StatusDot } from "@/components/ui/status-dot"

type ServeDetailPanelProps = {
  serve: ServeRow
  environmentLabel: string
  serveLogs: ServeLogsOnlyDetail | undefined
  busy: boolean
  onSelectServe: (id: string | null) => void
  onStopServe: (id: ServeRow["serve_id"]) => void
}

function ServeDetailPanel({
  serve,
  environmentLabel,
  serveLogs,
  busy,
  onSelectServe,
  onStopServe,
}: ServeDetailPanelProps) {
  return (
    <Card variant="surface" className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <StatusDot variant={serveStatusDotVariant(serve.status)} size="md" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-foreground">
              {environmentLabel}
            </h2>
            <p className="text-xs text-muted-foreground">
              Created {new Date(serve.created_at).toLocaleString()}
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatServeStatus(serve.status)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {canStopServe(serve.status) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onStopServe(serve.serve_id)}
            >
              Stop serve
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-control"
            onClick={() => onSelectServe(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {serve.error ? (
        <div className="mx-6 mt-3">
          <Notice variant="error">{serve.error}</Notice>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-2 xl:grid-cols-4">
        <ServeSummaryCard
          title="Source"
          value={formatServeSource(serve.model_snapshot)}
          detail={serve.model_snapshot.source_model_path || undefined}
        />
        <ServeSummaryCard
          title="Runtime"
          value={formatServeDevice(serve)}
          detail={`Python ${serve.python_version}`}
        />
        <ServeSummaryCard
          title="Snapshot"
          value={formatServeSnapshotSize(serve.model_snapshot)}
        />
        <ServeSummaryCard
          title="Inference"
          value={serve.inference_path}
          detail="Tahuna-authenticated proxy root"
        />
      </div>

      <div className="px-6 pb-6">
        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent logs
          </h3>
          {serveLogs === undefined ? (
            <p className="text-sm text-muted-foreground">Loading serve logs…</p>
          ) : serveLogs.recent_logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runtime logs yet.</p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-md bg-background/70 p-3">
              <div className="space-y-1 font-mono text-xs whitespace-pre-wrap text-foreground">
                {serveLogs.recent_logs.map((line, index) => (
                  <div key={`${line.timestamp}-${index}`}>
                    <span className="text-muted-foreground">
                      {new Date(line.timestamp).toLocaleTimeString()} [{line.source}]
                    </span>{" "}
                    {line.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function ServeSummaryCard({
  title,
  value,
  detail,
}: {
  title: string
  value: string
  detail?: string
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 break-all text-sm text-foreground">{value}</p>
      {detail ? (
        <p className="mt-1 break-all text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  )
}

export { ServeDetailPanel }
