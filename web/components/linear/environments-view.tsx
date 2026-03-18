"use client"

import { Server, Plus, Filter, Settings2, LayoutGrid, Play, Trash2, ExternalLink, Copy, Check, FileCode2, Share2, Users, X } from "lucide-react"
import { Fragment, useEffect, useState } from "react"
import Link from "next/link"
import {
  type DataBlobRow,
  type EnvironmentRow,
} from "@/components/dashboard/shared"
import type { Id } from "@convex/_generated/dataModel"
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
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Notice } from "@/components/ui/notice"
import { Textarea } from "@/components/ui/textarea"

type EnvironmentsViewProps = {
  environments: EnvironmentRow[]
  uniqueDataBlobs: DataBlobRow[]
  dataBlobsById: ReadonlyMap<string, DataBlobRow>
  bindSelectionByEnvironment: Record<string, string>
  busy: boolean
  configEditorEnvironmentId: string | null
  configName: string
  configDraft: string
  configSourceText: string
  configError: string
  configLoading: boolean
  configSaving: boolean
  onBindSelectionChange: (environmentId: string, value: string) => void
  onBindSelectedData: (environment: EnvironmentRow) => void
  onUnbindData: (environmentId: EnvironmentRow["environment_id"], dataId: string) => void
  onLaunchRun: (environmentId: EnvironmentRow["environment_id"]) => void
  onOpenConfigEditor: (environment: EnvironmentRow) => void
  onCloseConfigEditor: () => void
  onConfigDraftChange: (value: string) => void
  onCancelConfigEdit: () => void
  onSaveConfig: (environmentId: EnvironmentRow["environment_id"]) => void
  onDeleteEnvironments: (environmentIds: EnvironmentRow["environment_id"][]) => Promise<void>
  sharedByMeResourceIds?: ReadonlySet<string>
  onShareEnvironment?: (environmentId: string) => void
}

export function EnvironmentsView({
  environments,
  uniqueDataBlobs,
  dataBlobsById,
  bindSelectionByEnvironment,
  busy,
  configEditorEnvironmentId,
  configName,
  configDraft,
  configSourceText,
  configError,
  configLoading,
  configSaving,
  onBindSelectionChange,
  onBindSelectedData,
  onUnbindData,
  onLaunchRun,
  onOpenConfigEditor,
  onCloseConfigEditor,
  onConfigDraftChange,
  onCancelConfigEdit,
  onSaveConfig,
  onDeleteEnvironments,
  sharedByMeResourceIds,
  onShareEnvironment,
}: EnvironmentsViewProps) {
  const hasData = environments.length > 0
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedEnvironmentIds, setSelectedEnvironmentIds] = useState<Id<"environments">[]>([])

  useEffect(() => {
    const environmentIdSet = new Set(environments.map((environment) => environment.environment_id))
    setSelectedEnvironmentIds((current) => {
      const next = current.filter((environmentId) => environmentIdSet.has(environmentId))
      if (next.length === current.length && next.every((environmentId, index) => environmentId === current[index])) {
        return current
      }
      return next
    })
  }, [environments])

  useEffect(() => {
    if (!hasData && selectionMode) {
      disableSelectionMode()
    }
  }, [hasData, selectionMode])

  const allEnvironmentsSelected = environments.length > 0 && selectedEnvironmentIds.length === environments.length
  const selectedEnvironmentCount = selectedEnvironmentIds.length

  function disableSelectionMode() {
    setSelectionMode(false)
    setSelectedEnvironmentIds([])
  }

  function toggleEnvironmentSelection(environmentId: Id<"environments">, nextChecked: boolean) {
    setSelectedEnvironmentIds((current) => {
      if (nextChecked) {
        if (current.includes(environmentId)) return current
        return [...current, environmentId]
      }
      return current.filter((id) => id !== environmentId)
    })
  }

  function toggleAllEnvironmentSelections(nextChecked: boolean) {
    if (nextChecked) {
      setSelectedEnvironmentIds(environments.map((environment) => environment.environment_id))
      return
    }
    setSelectedEnvironmentIds([])
  }

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
          {selectionMode ? (
            <>
              <span className="text-xs text-muted-foreground">{selectedEnvironmentCount}</span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="dashboard-icon-secondary"
                    size="none"
                    aria-label="Delete selected environments"
                    disabled={busy || selectedEnvironmentCount === 0}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedEnvironmentCount} environment{selectedEnvironmentCount === 1 ? "" : "s"}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes selected environments and their associated run data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        void onDeleteEnvironments(selectedEnvironmentIds).then(() => {
                          disableSelectionMode()
                        })
                      }}
                      disabled={busy || selectedEnvironmentCount === 0}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                type="button"
                variant="dashboard-icon-secondary"
                size="none"
                onClick={disableSelectionMode}
                aria-label="Done selecting environments"
                disabled={busy}
              >
                <X className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="dashboard-icon-secondary" size="none">
                <Filter className="w-4 h-4" />
              </Button>
              <Button type="button" variant="dashboard-icon-secondary" size="none">
                <Settings2 className="w-4 h-4" />
              </Button>
              <Button type="button" variant="dashboard-icon-secondary" size="none">
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="dashboard-icon-secondary"
                size="none"
                onClick={() => setSelectionMode(true)}
                aria-label="Select environments"
                disabled={busy || !hasData}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="px-6 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          <Button type="button" variant="dashboard-tab-compact-active" size="none">
            All environments
          </Button>
          <Button type="button" variant="dashboard-tab-compact" size="none">
            <Plus className="w-3.5 h-3.5" />
            New view
          </Button>
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
                <th className="w-10 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <Checkbox
                    checked={allEnvironmentsSelected || (selectedEnvironmentCount > 0 && "indeterminate")}
                    onCheckedChange={(checked) => toggleAllEnvironmentSelections(checked === true)}
                    className={selectionMode ? "" : "pointer-events-none invisible"}
                    tabIndex={selectionMode ? 0 : -1}
                    aria-label="Select all environments"
                    disabled={!selectionMode || busy}
                  />
                </th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">ID</th>
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
                const hasPrimaryData = Boolean(env.latest_data_manifest_hash)
                const configOpen = configEditorEnvironmentId === env.environment_id
                const configDirty = configDraft !== configSourceText

                return (
                  <Fragment key={env.environment_id}>
                    <tr className="border-b border-border hover:bg-secondary/50 group align-top">
                      <td className="w-10 px-3 py-2.5">
                        <Checkbox
                          checked={selectedEnvironmentIds.includes(env.environment_id)}
                          onCheckedChange={(checked) =>
                            toggleEnvironmentSelection(env.environment_id, checked === true)
                          }
                          className={selectionMode ? "" : "pointer-events-none invisible"}
                          tabIndex={selectionMode ? 0 : -1}
                          aria-label={`Select environment ${env.environment_id}`}
                          disabled={!selectionMode || busy}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-foreground">
                        {env.environment_id}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-foreground">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <p>{env.name}</p>
                            {sharedByMeResourceIds?.has(env.environment_id) && (
                              <Users className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Python {env.python_version}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-muted-foreground">
                        <div className="space-y-0.5">
                          <p>{env.framework}:{env.version}</p>
                          <p>{env.gpu_type} x{env.gpu_count} | {env.volume_gb}GB</p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-1">
                            {!hasPrimaryData && env.bound_data_ids.length === 0 ? (
                              <span className="text-xs text-muted-foreground">No synced or bound datasets</span>
                            ) : (
                              <>
                                {hasPrimaryData ? (
                                  <span className="inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-foreground">
                                    Primary synced data
                                  </span>
                                ) : null}
                                {env.bound_data_ids.map((dataId) => {
                                  const blob = dataBlobsById.get(dataId)
                                  return (
                                    <div key={`${env.environment_id}-${dataId}`} className="flex items-center gap-1">
                                      <span className="inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-foreground">
                                        {blob ? blob.filename : dataId}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="dashboard-outline-compact-muted"
                                        size="none"
                                        onClick={() => onUnbindData(env.environment_id, dataId)}
                                        disabled={busy}
                                      >
                                        Unbind
                                      </Button>
                                    </div>
                                  )
                                })}
                              </>
                            )}
                          </div>
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
                            <Button
                              type="button"
                              variant="dashboard-outline-compact"
                              size="none"
                              onClick={() => onBindSelectedData(env)}
                              disabled={
                                busy ||
                                availableDataBlobs.length === 0 ||
                                !(bindSelectionByEnvironment[env.environment_id] || "").trim()
                              }
                            >
                              Bind
                            </Button>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant={configOpen ? "dashboard-primary" : "dashboard-outline"}
                            size="sm"
                            onClick={() => {
                              if (configOpen) {
                                onCloseConfigEditor()
                                return
                              }
                              onOpenConfigEditor(env)
                            }}
                            disabled={configSaving}
                          >
                            <FileCode2 className="w-3 h-3" />
                            Config
                          </Button>
                          <Button
                            type="button"
                            variant="dashboard-outline-compact-gap"
                            size="none"
                            onClick={() => onLaunchRun(env.environment_id)}
                            disabled={busy}
                          >
                            <Play className="w-3 h-3" />
                            Run
                          </Button>
                          {onShareEnvironment && (
                            <Button
                              type="button"
                              variant="dashboard-outline-icon-muted"
                              size="none"
                              onClick={() => onShareEnvironment(env.environment_id)}
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {configOpen ? (
                      <tr className="border-b border-border bg-secondary/20">
                        <td colSpan={6} className="px-6 pb-4 pt-1">
                          <div className="rounded-xl border border-border bg-background/80 p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <h3 className="text-sm font-medium text-foreground">Environment config</h3>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  <span className="font-mono text-foreground">{configName}</span> is generated from the stored environment record. Saving changes updates future runs for this environment.
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {configDirty ? (
                                  <span className="text-xs text-amber-500">Unsaved changes</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Saved</span>
                                )}
                                <Button variant="dashboard-outline" size="sm" onClick={onCloseConfigEditor} disabled={configSaving}>
                                  Close
                                </Button>
                              </div>
                            </div>
                            <div className="mt-4 space-y-3">
                              {configError ? <Notice variant="error">{configError}</Notice> : null}
                              {configLoading ? (
                                <p className="text-xs text-muted-foreground">Loading current config…</p>
                              ) : null}
                              <Textarea
                                value={configDraft}
                                onChange={(event) => onConfigDraftChange(event.target.value)}
                                disabled={configSaving}
                                rows={11}
                                spellCheck={false}
                              />
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs text-muted-foreground">
                                  Supported keys: <code>name</code>, <code>framework</code>, <code>version</code>, <code>python_version</code>, <code>gpu_type</code>, <code>gpu_count</code>, <code>volume_gb</code>.
                                </p>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="dashboard-outline"
                                    size="sm"
                                    onClick={onCancelConfigEdit}
                                    disabled={configSaving || !configDirty}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    variant="dashboard-primary"
                                    size="sm"
                                    onClick={() => onSaveConfig(env.environment_id)}
                                    disabled={configSaving || !configDirty}
                                  >
                                    {configSaving ? "Saving…" : "Save config"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
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
        <Button
          type="button"
          variant="dashboard-outline-icon-muted"
          size="none"
          onClick={copyCommand}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  )
}
