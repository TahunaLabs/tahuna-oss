"use client"

import { Server, Plus, Filter, Settings2, LayoutGrid, Play, Trash2 } from "lucide-react"
import {
  type DataBlobRow,
  type EnvironmentRow,
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

type EnvironmentsViewProps = {
  environments: EnvironmentRow[]
  uniqueDataBlobs: DataBlobRow[]
  dataBlobsById: ReadonlyMap<string, DataBlobRow>
  bindSelectionByEnvironment: Record<string, string>
  busy: boolean
  onBindSelectionChange: (environmentId: string, value: string) => void
  onBindSelectedData: (environment: EnvironmentRow) => void
  onUnbindData: (environmentId: EnvironmentRow["environment_id"], dataId: string) => void
  onLaunchRun: (environmentId: EnvironmentRow["environment_id"]) => void
  onDeleteEnvironment: (environmentId: EnvironmentRow["environment_id"]) => void
}

export function EnvironmentsView({
  environments,
  uniqueDataBlobs,
  dataBlobsById,
  bindSelectionByEnvironment,
  busy,
  onBindSelectionChange,
  onBindSelectedData,
  onUnbindData,
  onLaunchRun,
  onDeleteEnvironment,
}: EnvironmentsViewProps) {
  const hasData = environments.length > 0

  return (
    <main className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-foreground">Environments</h1>
          {environments.length > 0 && (
            <span className="text-xs text-muted-foreground">{environments.length}</span>
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
          <button className="px-3 py-1.5 text-sm bg-secondary text-foreground rounded">
            All environments
          </button>
          <button className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
            New view
          </button>
        </div>
      </div>

      {/* CLI hint */}
      <div className="px-6 py-2 border-b border-border">
        <p className="text-xs text-muted-foreground">
          Environments are created via CLI. Run <code className="px-1 py-0.5 bg-secondary rounded">tahuna init .</code> from your project folder.
        </p>
      </div>

      {/* Content */}
      {!hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-6">
              <Server className="w-16 h-16 text-muted-foreground/50" strokeWidth={1} />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-3">Environments</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Configure and manage deployment environments. Set up development, staging,
              and production environments with their own variables and settings.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button className="px-4 py-2 bg-accent text-accent-foreground text-sm rounded hover:opacity-90 flex items-center gap-2">
                Create environment
                <kbd className="px-1.5 py-0.5 bg-accent-foreground/20 rounded text-xs">N</kbd>
                <span className="text-xs opacity-70">then</span>
                <kbd className="px-1.5 py-0.5 bg-accent-foreground/20 rounded text-xs">E</kbd>
              </button>
              <button className="px-4 py-2 bg-secondary text-foreground text-sm rounded hover:bg-secondary/80">
                Documentation
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border text-left">
                <th className="px-6 py-2 text-xs font-medium text-muted-foreground">ID</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Spec</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Data bindings</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {environments.map((env) => {
                const availableDataBlobs = uniqueDataBlobs.filter(
                  (blob) => !env.bound_data_ids.includes(blob.blob_id),
                )

                return (
                  <tr
                    key={env.environment_id}
                    className="border-b border-border hover:bg-secondary/50 group align-top"
                  >
                    <td className="px-6 py-2.5 font-mono text-xs text-foreground">
                      {env.environment_id}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-foreground">
                      {env.name}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-muted-foreground">
                      <div className="space-y-0.5">
                        <p>{env.framework}:{env.version}</p>
                        <p>{env.gpu_type} x{env.gpu_count} | {env.volume_gb}GB</p>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="space-y-2">
                        {/* Bound datasets */}
                        <div className="flex flex-wrap items-center gap-1">
                          {env.bound_data_ids.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No bound datasets</span>
                          ) : (
                            env.bound_data_ids.map((dataId) => {
                              const blob = dataBlobsById.get(dataId)
                              return (
                                <div key={`${env.environment_id}-${dataId}`} className="flex items-center gap-1">
                                  <span className="inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-foreground">
                                    {blob ? blob.filename : dataId}
                                  </span>
                                  <button
                                    onClick={() => onUnbindData(env.environment_id, dataId)}
                                    disabled={busy}
                                    className="px-1.5 py-0.5 text-xs rounded border border-border hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
                                  >
                                    Unbind
                                  </button>
                                </div>
                              )
                            })
                          )}
                        </div>
                        {/* Bind selector */}
                        <div className="flex items-center gap-1.5">
                          <select
                            value={bindSelectionByEnvironment[env.environment_id] || ""}
                            onChange={(e) => onBindSelectionChange(env.environment_id, e.target.value)}
                            disabled={busy || availableDataBlobs.length === 0}
                            className="h-7 rounded border border-border bg-secondary/50 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                          >
                            <option value="">
                              {availableDataBlobs.length === 0 ? "No datasets available" : "Select dataset"}
                            </option>
                            {availableDataBlobs.map((blob) => (
                              <option key={`${env.environment_id}-opt-${blob.blob_id}`} value={blob.blob_id}>
                                {blob.filename} ({blob.blob_id})
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => onBindSelectedData(env)}
                            disabled={
                              busy ||
                              availableDataBlobs.length === 0 ||
                              !(bindSelectionByEnvironment[env.environment_id] || "").trim()
                            }
                            className="px-2 py-1 text-xs rounded border border-border hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Bind
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onLaunchRun(env.environment_id)}
                          disabled={busy}
                          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-secondary disabled:opacity-50"
                        >
                          <Play className="w-3 h-3" />
                          Run
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              disabled={busy}
                              className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-destructive-foreground disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete environment?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete environment <code>{env.environment_id}</code>, its runs, and associated runtime logs, metrics, and artifacts.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep environment</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDeleteEnvironment(env.environment_id)}
                                disabled={busy}
                              >
                                Delete environment
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
