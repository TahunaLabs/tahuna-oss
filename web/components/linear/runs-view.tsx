"use client"

import { useState } from "react"
import { Play, Plus, Filter, Settings2, LayoutGrid, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  CANCELLABLE_STATUSES,
  type EnvironmentRow,
  type RunRow,
} from "@/components/dashboard/shared"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import Link from "next/link"

type RunsViewProps = {
  environments: EnvironmentRow[]
  runs: RunRow[]
  busy: boolean
  onCancelRun: (runId: RunRow["run_id"]) => void
}

type RunTab = "all" | "active" | "completed"

const ACTIVE_STATUSES = new Set(["queued", "provisioning", "running", "cancelling"])
const COMPLETED_STATUSES = new Set(["completed", "failed", "cancelled"])

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-500/20 text-yellow-400",
  provisioning: "bg-blue-500/20 text-blue-400",
  running: "bg-green-500/20 text-green-400",
  completed: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
  cancelled: "bg-muted text-muted-foreground",
  cancelling: "bg-orange-500/20 text-orange-400",
}

export function RunsView({ environments, runs, busy, onCancelRun }: RunsViewProps) {
  const [activeTab, setActiveTab] = useState<RunTab>("all")

  const filteredRuns = runs.filter((run) => {
    if (activeTab === "active") return ACTIVE_STATUSES.has(run.status)
    if (activeTab === "completed") return COMPLETED_STATUSES.has(run.status)
    return true
  })

  const hasData = filteredRuns.length > 0
  const noEnvironments = environments.length === 0

  return (
    <main className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-foreground">Runs</h1>
          {runs.length > 0 && (
            <span className="text-xs text-muted-foreground">{runs.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <Filter className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <Settings2 className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-6 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          <TabButton label="All runs" active={activeTab === "all"} onClick={() => setActiveTab("all")} />
          <TabButton
            label="Active"
            active={activeTab === "active"}
            onClick={() => setActiveTab("active")}
            count={runs.filter((r) => ACTIVE_STATUSES.has(r.status)).length}
          />
          <TabButton
            label="Completed"
            active={activeTab === "completed"}
            onClick={() => setActiveTab("completed")}
          />
          <button className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      {noEnvironments ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-6">
              <Play className="w-16 h-16 text-muted-foreground/50" strokeWidth={1} />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-3">Runs</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Create an environment first to launch runs. Run <code className="px-1 py-0.5 bg-secondary rounded text-xs">tahuna init .</code> from your project folder.
            </p>
          </div>
        </div>
      ) : !hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-6">
              <Play className="w-16 h-16 text-muted-foreground/50" strokeWidth={1} />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-3">Runs</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              {activeTab !== "all"
                ? `No ${activeTab} runs.`
                : "View and manage your workflow runs. Track builds, deployments, and automated tasks across all your projects."}
            </p>
            {activeTab === "all" && (
              <div className="flex items-center justify-center gap-3">
                <button className="px-4 py-2 bg-accent text-accent-foreground text-sm rounded hover:opacity-90 flex items-center gap-2">
                  Trigger run
                  <kbd className="px-1.5 py-0.5 bg-accent-foreground/20 rounded text-xs">N</kbd>
                  <span className="text-xs opacity-70">then</span>
                  <kbd className="px-1.5 py-0.5 bg-accent-foreground/20 rounded text-xs">R</kbd>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border text-left">
                <th className="px-6 py-2 text-xs font-medium text-muted-foreground">Run</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Environment</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Infra</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((run) => (
                <tr
                  key={run.run_id}
                  className="border-b border-border hover:bg-secondary/50 group"
                >
                  <td className="px-6 py-2.5 font-mono text-xs text-foreground">
                    {run.run_id}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn(
                      "inline-flex px-2 py-0.5 rounded text-xs capitalize",
                      STATUS_COLORS[run.status] || "bg-secondary text-foreground"
                    )}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {run.environment_id}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-muted-foreground">
                    {run.effective_gpu_type || "-"} / {run.effective_gpu_count || "-"} / {run.effective_volume_gb || "-"}GB
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/dashboard/runs/${run.run_id}`}
                        className="px-2 py-1 text-xs rounded border border-border hover:bg-secondary text-foreground"
                      >
                        Details
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            disabled={busy || !CANCELLABLE_STATUSES.has(run.status)}
                            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel this run?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Run <code>{run.run_id}</code> will move to cancellation flow. In-progress compute may continue briefly during graceful shutdown.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep running</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onCancelRun(run.run_id)} disabled={busy}>
                              Cancel run
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}

function TabButton({
  label,
  active,
  onClick,
  count,
}: {
  label: string
  active: boolean
  onClick: () => void
  count?: number
}) {
  return (
    <button
      className={cn(
        "px-3 py-1.5 text-sm rounded flex items-center gap-1.5",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
      )}
      onClick={onClick}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-xs">
          {count}
        </span>
      )}
    </button>
  )
}
