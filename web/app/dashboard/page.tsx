"use client"

import { useTheme } from "@/components/theme-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Notice } from "@/components/ui/notice"
import { Select } from "@/components/ui/select"
import { PageLoader } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { authClient } from "@/lib/auth-client"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import {
  Monitor,
  Database,
  Download,
  ExternalLink,
  LogOut,
  Moon,
  Play,
  Server,
  Sun,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, type ComponentType, type FormEvent, type ReactNode } from "react"

type MainSection = "data" | "environments" | "runs"

type StorageItem = {
  id: string
  source: "data" | "run_artifact"
  key: string
  name: string
  path: string
  size: number
  download_url: string
  created_at: number
  run_id?: string
  data_blob_id?: string
}

type StorageSort = "created_desc" | "created_asc" | "name_asc" | "name_desc" | "size_desc" | "size_asc"

type StorageListResult = {
  items: StorageItem[]
  total: number
  offset: number
  limit: number
  has_more: boolean
  next_offset: number | null
}

type EnvironmentRow = {
  environment_id: Id<"environments">
  name: string
  gpu_type: string
  gpu_count: number
  volume_gb: number
  framework: string
  version: string
}

type RunRow = {
  run_id: Id<"runs">
  env_id: string
  status: string
  effective_gpu_type: string
  effective_gpu_count: number
  effective_volume_gb: number
}

type SidebarItem = {
  id: string
  label: string
  icon: ComponentType<{ className?: string }>
  section: MainSection
}

const PAGE_TITLES: Record<MainSection, string> = {
  data: "Storage",
  environments: "Environments",
  runs: "Runs",
}

const FEATURE_ITEMS: SidebarItem[] = [
  { id: "data", label: "Storage", icon: Database, section: "data" },
  { id: "environments", label: "Environments", icon: Server, section: "environments" },
  { id: "runs", label: "Runs", icon: Play, section: "runs" },
]

const CANCELLABLE_STATUSES = new Set(["queued", "provisioning", "running", "cancelling"])
const STORAGE_PAGE_LIMIT = 25

function formatBytes(size: number) {
  if (size <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** unitIndex
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function BottomHalfEmptyMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="px-5 text-center text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

function SidebarSection({
  label,
  items,
  activeSection,
  onSelect,
}: {
  label: string
  items: SidebarItem[]
  activeSection: MainSection
  onSelect: (section: MainSection) => void
}) {
  return (
    <section>
      <p className="px-2 pb-1 pt-2 text-[11px] font-medium tracking-[0.01em] text-muted-foreground">{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon

          const isActive = item.section === activeSection
          return (
            <Button
              key={item.id}
              type="button"
              size="none"
              variant={isActive ? "dashboard-nav-active" : "dashboard-nav"}
              onClick={() => onSelect(item.section)}
            >
              <Icon className="h-[15px] w-[15px]" />
              {item.label}
            </Button>
          )
        })}
      </div>
    </section>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [activeSection, setActiveSection] = useState<MainSection>("environments")

  const [selectedDataFiles, setSelectedDataFiles] = useState<File[]>([])
  const [uploadingData, setUploadingData] = useState(false)
  const [dataFileInputKey, setDataFileInputKey] = useState(0)
  const [storageSourceFilter, setStorageSourceFilter] = useState<"all" | "data" | "run_artifact">("all")
  const [storageSort, setStorageSort] = useState<StorageSort>("created_desc")
  const [storageSearch, setStorageSearch] = useState("")
  const [storageSearchDebounced, setStorageSearchDebounced] = useState("")
  const [storageOffset, setStorageOffset] = useState(0)
  const shouldLoadQueries = !authLoading && isAuthenticated && !loggingOut

  const currentUser = useQuery(api.auth.getCurrentUser, shouldLoadQueries ? {} : "skip")
  const storageResult = useQuery(
    api.storage.list,
    shouldLoadQueries
      ? {
          source: storageSourceFilter,
          sort: storageSort,
          search: storageSearchDebounced.trim() || undefined,
          offset: storageOffset,
          limit: STORAGE_PAGE_LIMIT,
        }
      : "skip",
  ) as StorageListResult | undefined
  const envResult = useQuery(api.environments.list, shouldLoadQueries ? {} : "skip") as
    | { environments: EnvironmentRow[] }
    | undefined
  const runResult = useQuery(api.runs.list, shouldLoadQueries ? {} : "skip") as
    | { runs: RunRow[] }
    | undefined

  const environments: EnvironmentRow[] = envResult?.environments ?? []
  const runs: RunRow[] = runResult?.runs ?? []

  const generateDataUploadUrlMutation = useMutation(api.data.generateUploadUrl)
  const removeEnvMutation = useMutation(api.environments.remove)
  const createRunMutation = useMutation(api.runs.create)
  const cancelRunMutation = useMutation(api.runs.cancel)
  const syncDataMetadataMutation = useMutation(api.data.syncMetadata)

  const userEmail = currentUser?.email ?? ""
  const userInitial = userEmail.trim().charAt(0).toUpperCase() || "U"
  const storageItems = storageResult?.items ?? []
  const storageTotal = storageResult?.total ?? 0
  const storageHasMore = storageResult?.has_more ?? false
  const isDark = resolvedTheme === "dark"

  useEffect(() => {
    const timeout = setTimeout(() => {
      setStorageSearchDebounced(storageSearch)
    }, 250)
    return () => clearTimeout(timeout)
  }, [storageSearch])

  useEffect(() => {
    setStorageOffset(0)
  }, [storageSearchDebounced, storageSort, storageSourceFilter])

  useEffect(() => {
    if (!storageResult) return
    if (storageTotal === 0 && storageOffset !== 0) {
      setStorageOffset(0)
      return
    }
    if (storageOffset >= storageTotal && storageTotal > 0) {
      const previousPage = Math.max(0, Math.floor((storageTotal - 1) / STORAGE_PAGE_LIMIT) * STORAGE_PAGE_LIMIT)
      if (previousPage !== storageOffset) {
        setStorageOffset(previousPage)
      }
    }
  }, [storageOffset, storageResult, storageTotal])

  async function withBusy(task: () => Promise<void>) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await task()
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "unexpected error")
    } finally {
      setBusy(false)
    }
  }

  async function uploadData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedDataFiles.length === 0) return

    setUploadingData(true)
    setError("")
    setMessage("")

    try {
      for (const file of selectedDataFiles) {
        const upload = await generateDataUploadUrlMutation({ filename: file.name, size_bytes: file.size })
        const response = await fetch(upload.url, {
          method: "PUT",
          headers: file.type ? { "Content-Type": file.type } : undefined,
          body: file,
        })

        if (!response.ok) {
          throw new Error(`upload failed with status ${response.status}`)
        }

        await syncDataMetadataMutation({ key: upload.key })
      }

      const uploadedCount = selectedDataFiles.length
      setSelectedDataFiles([])
      setDataFileInputKey((current) => current + 1)
      setMessage(uploadedCount === 1 ? "Uploaded 1 file." : `Uploaded ${uploadedCount} files.`)
    } catch (uploadError) {
      const uploadMessage = uploadError instanceof Error ? uploadError.message : "unexpected error"
      setError(
        uploadMessage === "Failed to fetch"
          ? "Upload failed. Check the R2 bucket CORS policy for PUT requests from this app origin."
          : uploadMessage,
      )
    } finally {
      setUploadingData(false)
    }
  }

  async function deleteEnvironment(environmentId: Id<"environments">) {
    await withBusy(async () => {
      await removeEnvMutation({ environmentId })
      setMessage(`Environment ${environmentId} deleted.`)
    })
  }

  async function launchRun(environmentId: Id<"environments">) {
    await withBusy(async () => {
      await createRunMutation({ environmentId })
      setMessage("Run launched.")
    })
  }

  async function cancelRun(runId: Id<"runs">) {
    await withBusy(async () => {
      await cancelRunMutation({ runId, force: false })
      setMessage(`Run ${runId} cancellation requested.`)
    })
  }

  async function logout() {
    setLoggingOut(true)
    setError("")
    setMessage("")
    try {
      await authClient.signOut()
      router.replace("/login")
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Failed to sign out.")
      setLoggingOut(false)
    }
  }

  if (authLoading || loggingOut || !isAuthenticated) {
    return <PageLoader message="Loading dashboard…" />
  }

  return (
    <div
      className="h-screen overflow-hidden bg-background text-foreground"
      style={{
        fontFamily:
          "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      }}
    >
      <header className="flex h-12 items-center justify-between border-b border-border px-5">
        <div className="flex items-center">
          <span className="text-logo font-serif text-[18px] font-bold tracking-[0.01em]">Tahuna</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {isDark ? (
              <Moon className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Switch
              id="dashboard-theme"
              aria-label="Toggle dark theme"
              checked={isDark}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>
          <Button type="button" variant="dashboard-top-link" size="none">
            Dashboard
          </Button>
          <Button asChild variant="dashboard-top-link" size="none">
            <a href="https://platform.openai.com/docs" target="_blank" rel="noreferrer">
              API Docs
            </a>
          </Button>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
            {userInitial}
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-3rem)]">
        <aside className="flex h-full w-[168px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-card p-2">
          <SidebarSection
            label="Features"
            items={FEATURE_ITEMS}
            activeSection={activeSection}
            onSelect={setActiveSection}
          />

          <div className="px-2 pt-2">
            <Button asChild type="button" variant="dashboard-nav" size="none">
              <Link href="/machines">
                <Monitor className="h-[15px] w-[15px]" />
                Machines
              </Link>
            </Button>
          </div>

          <div className="mt-auto pt-2">
            <Button
              type="button"
              variant="dashboard-logout"
              size="none"
              onClick={logout}
            >
              <LogOut className="h-[15px] w-[15px]" />
              Sign out
            </Button>
          </div>
        </aside>

        <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5">
          <h1 className="mb-5 text-[17px] font-semibold">{PAGE_TITLES[activeSection]}</h1>

          {error ? <Notice variant="error" className="mb-4">{error}</Notice> : null}
          {message ? <Notice className="mb-4">{message}</Notice> : null}

          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col pb-6">
            {activeSection === "data" ? (
              <section className="grid h-full min-h-0 grid-rows-[25%_75%] gap-3">
                <Card variant="dashboard" className="h-full overflow-y-auto p-4">
                  <h3 className="text-sm font-semibold">Ingest data</h3>
                  <form onSubmit={uploadData} className="mt-3 space-y-2.5">
                    <div className="space-y-1.5">
                      <Label htmlFor="data-file">Files</Label>
                      <Input
                        key={dataFileInputKey}
                        id="data-file"
                        type="file"
                        variant="dashboard"
                        multiple
                        disabled={uploadingData}
                        onChange={(event) => setSelectedDataFiles(Array.from(event.target.files ?? []))}
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
                          onChange={(event) => setStorageSearch(event.target.value)}
                          placeholder="File, path, run ID, or data ID"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="storage-source">Source</Label>
                        <Select
                          id="storage-source"
                          variant="dashboard"
                          value={storageSourceFilter}
                          onChange={(event) => setStorageSourceFilter(event.target.value as "all" | "data" | "run_artifact")}
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
                          onChange={(event) => setStorageSort(event.target.value as StorageSort)}
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

                {storageResult === undefined ? (
                  <BottomHalfEmptyMessage>Loading storage...</BottomHalfEmptyMessage>
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
                              {item.source === "data" ? (
                                <Badge variant="dashboard-run-status">Data</Badge>
                              ) : (
                                <Badge variant="dashboard-run-status">Run artifact</Badge>
                              )}
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
                              </div>
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
                          onClick={() => setStorageOffset((current) => Math.max(0, current - STORAGE_PAGE_LIMIT))}
                        >
                          Previous
                        </Button>
                        <Button
                          type="button"
                          variant="dashboard-outline"
                          size="none"
                          disabled={!storageHasMore}
                          onClick={() => setStorageOffset((current) => current + STORAGE_PAGE_LIMIT)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              </section>
            ) : null}

            {activeSection === "environments" ? (
              <section className="flex h-full min-h-0 flex-col gap-3">
                <Card variant="dashboard" className="shrink-0 p-4">
                  <p className="text-sm text-dashboard-subtle">
                    Environments are created via CLI init only. Run <code>tahuna init .</code> from your project folder.
                  </p>
                </Card>

                {environments.length === 0 ? (
                  <BottomHalfEmptyMessage>No environments yet.</BottomHalfEmptyMessage>
                ) : (
                  <Card variant="dashboard" className="min-h-0 flex-1 overflow-hidden">
                    <Table variant="dashboard">
                      <TableHeader variant="dashboard">
                        <TableRow variant="dashboard-head">
                          <TableHead variant="dashboard">ID</TableHead>
                          <TableHead variant="dashboard">Name</TableHead>
                          <TableHead variant="dashboard">Spec</TableHead>
                          <TableHead variant="dashboard">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {environments.map((env) => (
                          <TableRow key={env.environment_id} variant="dashboard">
                            <TableCell variant="dashboard" className="font-mono text-xs">
                              {env.environment_id}
                            </TableCell>
                            <TableCell variant="dashboard">{env.name}</TableCell>
                            <TableCell variant="dashboard" className="text-muted-foreground">
                              {env.framework}:{env.version} | {env.gpu_type} x{env.gpu_count} | {env.volume_gb}GB
                            </TableCell>
                            <TableCell variant="dashboard">
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="dashboard-outline"
                                  size="none"
                                  onClick={() => launchRun(env.environment_id)}
                                  disabled={busy}
                                >
                                  <Play className="h-3.5 w-3.5" />
                                  Run
                                </Button>
                                <Button
                                  type="button"
                                  variant="dashboard-outline-icon"
                                  size="none"
                                  onClick={() => deleteEnvironment(env.environment_id)}
                                  disabled={busy}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </section>
            ) : null}

            {activeSection === "runs" ? (
              <section className="grid h-full min-h-0 grid-rows-[25%_75%] gap-3">
                <div />
                {environments.length === 0 ? (
                  <BottomHalfEmptyMessage>Create an environment first to launch runs.</BottomHalfEmptyMessage>
                ) : runs.length === 0 ? (
                  <BottomHalfEmptyMessage>No runs yet. Go to Runs and start one.</BottomHalfEmptyMessage>
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
                              {run.env_id}
                            </TableCell>
                            <TableCell variant="dashboard" className="text-muted-foreground">
                              {run.effective_gpu_type || "-"} / {run.effective_gpu_count || "-"} / {run.effective_volume_gb || "-"}GB
                            </TableCell>
                            <TableCell variant="dashboard">
                              <Button
                                type="button"
                                variant="dashboard-outline"
                                size="none"
                                disabled={busy || !CANCELLABLE_STATUSES.has(run.status)}
                                onClick={() => cancelRun(run.run_id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Cancel
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </section>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  )
}
