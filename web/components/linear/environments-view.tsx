"use client"

import { Server, Plus, Filter, Settings2, LayoutGrid, Play, Trash2, ExternalLink, Copy, Check } from "lucide-react"
import { useState } from "react"
import Link from "next/link"
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

      {/* Content */}
      {!hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-lg">
            <div className="text-center mb-6">
              <Server className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" strokeWidth={1} />
              <h2 className="text-lg font-medium text-foreground mb-2">New Environment</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Create and manage compute environments using the Tahuna CLI.
              </p>
            </div>

            <div className="space-y-5 px-2">
              <CliStep number={1} label="Install the Tahuna CLI" command="brew install tahuna" />
              <CliStep number={2} label="Login to your account" command="tahuna login" />
              <CliStep number={3} label="Set up your environment" command="tahuna init ." />
              <CliStep number={4} label="Start a run" command="tahuna run" />

              <p className="text-xs text-muted-foreground text-center">
                You can explore example configs in <code className="px-1 py-0.5 bg-secondary rounded">/configs/</code>, or set up your own using <code className="px-1 py-0.5 bg-secondary rounded">tahuna init</code>.
              </p>

              <Link
                href="https://github.com/Pazuzzu/tahuna/tree/develop/docs"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-secondary text-foreground text-sm rounded-lg hover:bg-secondary/80 transition-colors"
              >
                Full Documentation
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
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

function CliStep({ number, label, command }: { number: number; label: string; command: string }) {
  const [copied, setCopied] = useState(false)

  const copyCommand = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-1.5">
        {number}. {label}
      </p>
      <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary/70 border border-border px-4 py-2.5">
        <code className="text-sm text-foreground font-mono">{command}</code>
        <button
          onClick={copyCommand}
          className="p-1 rounded hover:bg-background/50 text-muted-foreground hover:text-foreground shrink-0 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  )
}
