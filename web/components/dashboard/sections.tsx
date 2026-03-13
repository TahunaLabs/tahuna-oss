"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Download, ExternalLink, Pencil, Play, Trash2 } from "lucide-react"
import Link from "next/link"
import type { FormEvent } from "react"

import {
  BottomHalfEmptyMessage,
  CANCELLABLE_STATUSES,
  formatBytes,
  MAX_ARTIFACT_NAME_CHARS,
  type DataBlobRow,
  type EnvironmentRow,
  type RunRow,
  type StorageItem,
  type StorageListResult,
  type StorageSort,
  type StorageSourceFilter,
} from "@/components/dashboard/shared"

type StorageSectionProps = {
  selectedDataFiles: File[]
  uploadingData: boolean
  dataFileInputKey: number
  storageSearch: string
  storageSourceFilter: StorageSourceFilter
  storageSort: StorageSort
  storageResult: StorageListResult | undefined
  storageLoading: boolean
  storageError: string
  renamingStorageId: string | null
  artifactRenameDraft: string
  artifactRenameBusyId: string | null
  onUploadData: (event: FormEvent<HTMLFormElement>) => void
  onSelectDataFiles: (files: File[]) => void
  onStorageSearchChange: (value: string) => void
  onStorageSourceFilterChange: (value: StorageSourceFilter) => void
  onStorageSortChange: (value: StorageSort) => void
  onArtifactRenameDraftChange: (value: string) => void
  onSaveRenameArtifact: (item: StorageItem) => void
  onCancelRenameArtifact: () => void
  onStartRenameArtifact: (item: StorageItem) => void
  onPreviousStoragePage: () => void
  onNextStoragePage: () => void
}

export function StorageSection({
  selectedDataFiles,
  uploadingData,
  dataFileInputKey,
  storageSearch,
  storageSourceFilter,
  storageSort,
  storageResult,
  storageLoading,
  storageError,
  renamingStorageId,
  artifactRenameDraft,
  artifactRenameBusyId,
  onUploadData,
  onSelectDataFiles,
  onStorageSearchChange,
  onStorageSourceFilterChange,
  onStorageSortChange,
  onArtifactRenameDraftChange,
  onSaveRenameArtifact,
  onCancelRenameArtifact,
  onStartRenameArtifact,
  onPreviousStoragePage,
  onNextStoragePage,
}: StorageSectionProps) {
  const storageItems = storageResult?.items ?? []
  const storageTotal = storageResult?.total ?? 0
  const storageOffset = storageResult?.offset ?? 0
  const storageHasMore = storageResult?.has_more ?? false

  return (
    <section className="grid h-full min-h-0 grid-rows-[25%_75%] gap-3">
      <Card variant="dashboard" className="h-full overflow-y-auto p-4">
        <h3 className="text-sm font-semibold">Ingest data</h3>
        <form onSubmit={onUploadData} className="mt-3 space-y-2.5">
          <div className="space-y-1.5">
            <Label htmlFor="data-file">Files</Label>
            <Input
              key={dataFileInputKey}
              id="data-file"
              type="file"
              variant="dashboard"
              multiple
              disabled={uploadingData}
              onChange={(event) => onSelectDataFiles(Array.from(event.target.files ?? []))}
            />
          </div>

          {selectedDataFiles.length > 0 ? (
            <div className="rounded-lg border border-border p-2.5">
              {selectedDataFiles.map((file) => (
                <p key={`${file.name}-${file.size}-${file.lastModified}`} className="text-sm text-muted-foreground">
                  {file.name} ({formatBytes(file.size)})
                </p>
              ))}
            </div>
          ) : null}

          <Button
            type="submit"
            variant="dashboard-primary"
            disabled={selectedDataFiles.length === 0 || uploadingData}
          >
            {uploadingData ? "Uploading..." : "Ingest data"}
          </Button>
        </form>

        <div className="mt-4 border-t border-border pt-3">
          <h4 className="text-sm font-semibold">Browse storage</h4>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="storage-search">Search</Label>
              <Input
                id="storage-search"
                variant="dashboard"
                value={storageSearch}
                onChange={(event) => onStorageSearchChange(event.target.value)}
                placeholder="File, path, run ID, or data ID"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="storage-source">Source</Label>
              <Select
                id="storage-source"
                variant="dashboard"
                value={storageSourceFilter}
                onChange={(event) => onStorageSourceFilterChange(event.target.value as StorageSourceFilter)}
              >
                <option value="all">All</option>
                <option value="data">Data uploads</option>
                <option value="run_artifact">Run artifacts</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="storage-sort">Sort</Label>
              <Select
                id="storage-sort"
                variant="dashboard"
                value={storageSort}
                onChange={(event) => onStorageSortChange(event.target.value as StorageSort)}
              >
                <option value="created_desc">Newest first</option>
                <option value="created_asc">Oldest first</option>
                <option value="name_asc">Name A-Z</option>
                <option value="name_desc">Name Z-A</option>
                <option value="size_desc">Largest first</option>
                <option value="size_asc">Smallest first</option>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {storageResult === undefined && storageLoading ? (
        <BottomHalfEmptyMessage>Loading storage...</BottomHalfEmptyMessage>
      ) : storageError ? (
        <BottomHalfEmptyMessage>{storageError}</BottomHalfEmptyMessage>
      ) : storageItems.length === 0 ? (
        <BottomHalfEmptyMessage>
          {storageSearch.trim() || storageSourceFilter !== "all"
            ? "No storage items match your current filters."
            : "No storage items yet."}
        </BottomHalfEmptyMessage>
      ) : (
        <Card variant="dashboard" className="h-full overflow-hidden">
          <Table variant="dashboard">
            <TableHeader variant="dashboard">
              <TableRow variant="dashboard-head">
                <TableHead variant="dashboard">Name</TableHead>
                <TableHead variant="dashboard">Source</TableHead>
                <TableHead variant="dashboard">Size</TableHead>
                <TableHead variant="dashboard">Created</TableHead>
                <TableHead variant="dashboard">Reference</TableHead>
                <TableHead variant="dashboard">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {storageItems.map((item) => (
                <TableRow key={item.id} variant="dashboard">
                  <TableCell variant="dashboard">
                    <div className="min-w-0">
                      <p className="truncate">{item.name}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{item.path}</p>
                    </div>
                  </TableCell>
                  <TableCell variant="dashboard">
                    <Badge variant="dashboard-run-status">
                      {item.source === "data" ? "Data" : "Run artifact"}
                    </Badge>
                  </TableCell>
                  <TableCell variant="dashboard" className="text-muted-foreground">
                    {formatBytes(item.size)}
                  </TableCell>
                  <TableCell variant="dashboard" className="text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell variant="dashboard" className="font-mono text-xs text-muted-foreground">
                    {item.source === "data" ? item.data_blob_id || "—" : item.run_id || "—"}
                  </TableCell>
                  <TableCell variant="dashboard">
                    {renamingStorageId === item.id ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          onSaveRenameArtifact(item)
                        }}
                      >
                        <Input
                          variant="dashboard"
                          value={artifactRenameDraft}
                          onChange={(event) => onArtifactRenameDraftChange(event.target.value)}
                          disabled={artifactRenameBusyId === item.id}
                          maxLength={MAX_ARTIFACT_NAME_CHARS}
                          className="h-8 w-40"
                        />
                        <Button
                          type="submit"
                          variant="dashboard-outline"
                          size="none"
                          disabled={artifactRenameBusyId === item.id}
                        >
                          {artifactRenameBusyId === item.id ? "Saving..." : "Save"}
                        </Button>
                        <Button
                          type="button"
                          variant="dashboard-outline"
                          size="none"
                          disabled={artifactRenameBusyId === item.id}
                          onClick={onCancelRenameArtifact}
                        >
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button asChild type="button" variant="dashboard-outline" size="none">
                          <a href={item.download_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </a>
                        </Button>
                        <Button asChild type="button" variant="dashboard-outline" size="none">
                          <a href={item.download_url} download={item.name}>
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                        </Button>
                        {item.source === "run_artifact" ? (
                          <Button
                            type="button"
                            variant="dashboard-outline"
                            size="none"
                            disabled={artifactRenameBusyId !== null}
                            onClick={() => onStartRenameArtifact(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Rename
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-border px-3 py-2.5 text-sm text-muted-foreground">
            <span>
              Showing {storageTotal === 0 ? 0 : storageOffset + 1}-{storageOffset + storageItems.length} of {storageTotal}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="dashboard-outline"
                size="none"
                disabled={storageOffset === 0}
                onClick={onPreviousStoragePage}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="dashboard-outline"
                size="none"
                disabled={!storageHasMore}
                onClick={onNextStoragePage}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </section>
  )
}

type EnvironmentsSectionProps = {
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

export function EnvironmentsSection({
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
}: EnvironmentsSectionProps) {
  if (environments.length === 0) {
    return (
      <section className="flex h-full min-h-0 flex-col gap-3">
        <Card variant="dashboard" className="shrink-0 p-4">
          <p className="text-sm text-dashboard-subtle">
            Environments are created via CLI init only. Run <code>tahuna init .</code> from your project folder.
          </p>
        </Card>
        <BottomHalfEmptyMessage>No environments yet.</BottomHalfEmptyMessage>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <Card variant="dashboard" className="shrink-0 p-4">
        <p className="text-sm text-dashboard-subtle">
          Environments are created via CLI init only. Run <code>tahuna init .</code> from your project folder.
        </p>
      </Card>

      <Card variant="dashboard" className="min-h-0 flex-1 overflow-hidden">
        <Table variant="dashboard">
          <TableHeader variant="dashboard">
            <TableRow variant="dashboard-head">
              <TableHead variant="dashboard">ID</TableHead>
              <TableHead variant="dashboard">Name</TableHead>
              <TableHead variant="dashboard">Spec</TableHead>
              <TableHead variant="dashboard">Data bindings</TableHead>
              <TableHead variant="dashboard">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {environments.map((environment) => {
              const availableDataBlobs = uniqueDataBlobs.filter(
                (blob) => !environment.bound_data_ids.includes(blob.blob_id),
              )

              return (
                <TableRow key={environment.environment_id} variant="dashboard">
                  <TableCell variant="dashboard" className="font-mono text-xs">
                    {environment.environment_id}
                  </TableCell>
                  <TableCell variant="dashboard">{environment.name}</TableCell>
                  <TableCell variant="dashboard" className="text-muted-foreground">
                    {environment.framework}:{environment.version} | {environment.gpu_type} x{environment.gpu_count} | {environment.volume_gb}GB
                  </TableCell>
                  <TableCell variant="dashboard">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {environment.bound_data_ids.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No bound datasets.</span>
                        ) : (
                          environment.bound_data_ids.map((dataId) => {
                            const blob = dataBlobsById.get(dataId)
                            return (
                              <div key={`${environment.environment_id}-${dataId}`} className="flex items-center gap-1">
                                <Badge variant="dashboard-run-status">{blob ? blob.filename : dataId}</Badge>
                                <Button
                                  type="button"
                                  variant="dashboard-outline"
                                  size="none"
                                  disabled={busy}
                                  onClick={() => onUnbindData(environment.environment_id, dataId)}
                                >
                                  Unbind
                                </Button>
                              </div>
                            )
                          })
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          variant="dashboard"
                          value={bindSelectionByEnvironment[environment.environment_id] || ""}
                          onChange={(event) =>
                            onBindSelectionChange(environment.environment_id, event.target.value)
                          }
                          disabled={busy || availableDataBlobs.length === 0}
                        >
                          <option value="">
                            {availableDataBlobs.length === 0 ? "No datasets available" : "Select dataset"}
                          </option>
                          {availableDataBlobs.map((blob) => (
                            <option key={`${environment.environment_id}-option-${blob.blob_id}`} value={blob.blob_id}>
                              {blob.filename} ({blob.blob_id})
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          variant="dashboard-outline"
                          size="none"
                          disabled={
                            busy ||
                            availableDataBlobs.length === 0 ||
                            !(bindSelectionByEnvironment[environment.environment_id] || "").trim()
                          }
                          onClick={() => onBindSelectedData(environment)}
                        >
                          Bind
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell variant="dashboard">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="dashboard-outline"
                        size="none"
                        onClick={() => onLaunchRun(environment.environment_id)}
                        disabled={busy}
                      >
                        <Play className="h-3.5 w-3.5" />
                        Run
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="dashboard-outline-icon"
                            size="none"
                            disabled={busy}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete environment?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete environment <code>{environment.environment_id}</code>, its runs, and associated runtime logs, metrics, and artifacts.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep environment</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onDeleteEnvironment(environment.environment_id)}
                              disabled={busy}
                            >
                              Delete environment
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </section>
  )
}

type RunsSectionProps = {
  environments: EnvironmentRow[]
  runs: RunRow[]
  busy: boolean
  onCancelRun: (runId: RunRow["run_id"]) => void
}

export function RunsSection({ environments, runs, busy, onCancelRun }: RunsSectionProps) {
  return (
    <section className="grid h-full min-h-0 grid-rows-[25%_75%] gap-3">
      <div />
      {environments.length === 0 ? (
        <BottomHalfEmptyMessage>Create an environment first to launch runs.</BottomHalfEmptyMessage>
      ) : runs.length === 0 ? (
        <BottomHalfEmptyMessage>No runs yet.</BottomHalfEmptyMessage>
      ) : (
        <Card variant="dashboard" className="h-full overflow-hidden">
          <Table variant="dashboard">
            <TableHeader variant="dashboard">
              <TableRow variant="dashboard-head">
                <TableHead variant="dashboard">Run</TableHead>
                <TableHead variant="dashboard">Status</TableHead>
                <TableHead variant="dashboard">Environment</TableHead>
                <TableHead variant="dashboard">Infra</TableHead>
                <TableHead variant="dashboard">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.run_id} variant="dashboard" className="align-top">
                  <TableCell variant="dashboard" className="font-mono text-xs">
                    {run.run_id}
                  </TableCell>
                  <TableCell variant="dashboard">
                    <Badge variant="dashboard-run-status">{run.status}</Badge>
                  </TableCell>
                  <TableCell variant="dashboard" className="font-mono text-xs">
                    {run.environment_id}
                  </TableCell>
                  <TableCell variant="dashboard" className="text-muted-foreground">
                    {run.effective_gpu_type || "-"} / {run.effective_gpu_count || "-"} / {run.effective_volume_gb || "-"}GB
                  </TableCell>
                  <TableCell variant="dashboard">
                    <div className="flex items-center gap-2">
                      <Button asChild type="button" variant="dashboard-outline" size="none">
                        <Link href={`/dashboard/runs/${run.run_id}`}>Details</Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="dashboard-outline"
                            size="none"
                            disabled={busy || !CANCELLABLE_STATUSES.has(run.status)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Cancel
                          </Button>
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  )
}
