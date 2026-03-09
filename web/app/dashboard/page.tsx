"use client"

import { MachineSelector } from "@/components/machine-selector"
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
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import {
  Database,
  Download,
  LogOut,
  Moon,
  Play,
  Server,
  Sun,
  Trash2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from "react"

type MainSection = "data" | "environments" | "runs"

type GPUInfo = {
  id: string
  displayName: string
  memoryInGb: number
  maxGpuCount: number
  pricePerHour?: number | null
}

type CatalogData = { images: Record<string, Record<string, string>> }

type DataBlob = {
  blob_id: string
  filename: string
  key: string
  size: number
  download_url: string
  created_at: number
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

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [activeSection, setActiveSection] = useState<MainSection>("environments")

  const [environmentNameInput, setEnvironmentNameInput] = useState("")
  const [explicitEnvGPUType, setExplicitEnvGPUType] = useState("")
  const [explicitEnvGPUCount, setExplicitEnvGPUCount] = useState("")
  const [selectedImageKey, setSelectedImageKey] = useState("")
  const [selectedDataFiles, setSelectedDataFiles] = useState<File[]>([])
  const [uploadingData, setUploadingData] = useState(false)
  const [dataFileInputKey, setDataFileInputKey] = useState(0)

  const catalog = useQuery(api.catalog.getCatalog) as CatalogData | undefined
  const getDynamicGpus = useAction(api.catalog.getDynamicGpus)
  const currentUser = useQuery(api.auth.getCurrentUser)
  const dataResult = useQuery(api.data.list) as { blobs: DataBlob[] } | undefined
  const envResult = useQuery(api.environments.list) as { environments: EnvironmentRow[] } | undefined
  const runResult = useQuery(api.runs.list) as { runs: RunRow[] } | undefined

  const [dynamicGpus, setDynamicGpus] = useState<GPUInfo[]>([])
  const [loadingGpus, setLoadingGpus] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    async function fetchGpus() {
      try {
        setLoadingGpus(true)
        const gpus = await getDynamicGpus()
        if (!cancelled) {
          setDynamicGpus(gpus)
        }
      } catch (fetchError) {
        console.error("Failed to fetch dynamic gpus", fetchError)
      } finally {
        if (!cancelled) {
          setLoadingGpus(false)
        }
      }
    }

    void fetchGpus()

    return () => {
      cancelled = true
    }
  }, [getDynamicGpus, isAuthenticated])

  const environments: EnvironmentRow[] = envResult?.environments ?? []
  const runs: RunRow[] = runResult?.runs ?? []

  const createEnvMutation = useMutation(api.environments.create)
  const generateDataUploadUrlMutation = useMutation(api.data.generateUploadUrl)
  const removeDataBlobMutation = useMutation(api.data.remove)
  const removeEnvMutation = useMutation(api.environments.remove)
  const createRunMutation = useMutation(api.runs.create)
  const removeRunMutation = useMutation(api.runs.remove)
  const syncDataMetadataMutation = useMutation(api.data.syncMetadata)

  const frameworkOptions = useMemo(() => {
    if (!catalog) return []

    return Object.entries(catalog.images).flatMap(([framework, versions]) =>
      Object.keys(versions).map((version) => ({
        key: `${framework}:${version}`,
        framework,
        version,
        label: `${framework.toUpperCase()} ${version}`,
      })),
    )
  }, [catalog])

  const envGPUType = explicitEnvGPUType || dynamicGpus[0]?.id || ""

  const selectedGPU = useMemo(() => {
    return dynamicGpus.find((gpu) => gpu.id === envGPUType) ?? null
  }, [dynamicGpus, envGPUType])

  const maxGPUs = selectedGPU?.maxGpuCount || 8
  const envGPUCount = useMemo(() => {
    const parsed = Number.parseInt(explicitEnvGPUCount || "1", 10)
    if (!Number.isFinite(parsed)) return 1
    return Math.min(Math.max(parsed, 1), maxGPUs)
  }, [explicitEnvGPUCount, maxGPUs])

  const imageSelection = useMemo(() => {
    return frameworkOptions.find((option) => option.key === selectedImageKey) ?? frameworkOptions[0] ?? null
  }, [frameworkOptions, selectedImageKey])

  const defaultEnvironmentName = useMemo(() => {
    const machineLabel = selectedGPU?.displayName ?? "Training"
    const frameworkLabel = imageSelection?.label ?? "Environment"
    return `${machineLabel} · ${frameworkLabel}`
  }, [imageSelection, selectedGPU])

  const userEmail = currentUser?.email ?? ""
  const userInitial = userEmail.trim().charAt(0).toUpperCase() || "U"
  const dataBlobs: DataBlob[] = dataResult?.blobs ?? []
  const isDark = resolvedTheme === "dark"

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

  async function createEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await withBusy(async () => {
      const environmentName = environmentNameInput.trim() || defaultEnvironmentName
      await createEnvMutation({
        name: environmentName,
        gpu_type: envGPUType,
        gpu_count: envGPUCount,
        volume_gb: 120,
        framework: imageSelection?.framework ?? "pt",
        version: imageSelection?.version ?? "",
      })
      setEnvironmentNameInput("")
      setMessage("Environment created.")
    })
  }

  async function uploadData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedDataFiles.length === 0) return

    setUploadingData(true)
    setError("")
    setMessage("")

    try {
      for (const file of selectedDataFiles) {
        const upload = await generateDataUploadUrlMutation({ filename: file.name })
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

  async function deleteDataBlob(key: string, blobId: string) {
    await withBusy(async () => {
      await removeDataBlobMutation({ key })
      setMessage(`Deleted ${blobId}.`)
    })
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
      await removeRunMutation({ runId })
      setMessage(`Run ${runId} cancellation requested.`)
    })
  }

  async function logout() {
    await authClient.signOut()
    router.replace("/auth")
  }

  if (authLoading || !isAuthenticated) {
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
                </Card>

                {dataBlobs.length === 0 ? (
                  <BottomHalfEmptyMessage>No ingested files yet.</BottomHalfEmptyMessage>
                ) : (
                  <Card variant="dashboard" className="h-full overflow-hidden">
                    <Table variant="dashboard">
                      <TableHeader variant="dashboard">
                        <TableRow variant="dashboard-head">
                          <TableHead variant="dashboard">File</TableHead>
                          <TableHead variant="dashboard">Size</TableHead>
                          <TableHead variant="dashboard">Uploaded</TableHead>
                          <TableHead variant="dashboard">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dataBlobs.map((blob) => (
                          <TableRow key={blob.key} variant="dashboard">
                            <TableCell variant="dashboard">{blob.filename}</TableCell>
                            <TableCell variant="dashboard" className="text-muted-foreground">
                              {formatBytes(blob.size)}
                            </TableCell>
                            <TableCell variant="dashboard" className="text-muted-foreground">
                              {new Date(blob.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell variant="dashboard">
                              <div className="flex items-center gap-2">
                                <Button asChild type="button" variant="dashboard-outline" size="none">
                                  <a href={blob.download_url} target="_blank" rel="noreferrer">
                                    <Download className="h-3.5 w-3.5" />
                                    Open
                                  </a>
                                </Button>
                                <Button
                                  type="button"
                                  variant="dashboard-outline-icon"
                                  size="none"
                                  onClick={() => deleteDataBlob(blob.key, blob.blob_id)}
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

            {activeSection === "environments" ? (
              <section className="flex h-full min-h-0 flex-col gap-3">
                <Card variant="dashboard" className="shrink-0 p-4">
                  <form onSubmit={createEnvironment} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="environment-name">Environment name</Label>
                      <Input
                        id="environment-name"
                        type="text"
                        variant="dashboard"
                        placeholder={defaultEnvironmentName}
                        value={environmentNameInput}
                        onChange={(event) => setEnvironmentNameInput(event.target.value)}
                      />
                    </div>

                    <MachineSelector
                      machines={dynamicGpus}
                      value={envGPUType}
                      loading={loadingGpus}
                      onChange={setExplicitEnvGPUType}
                      disabled={dynamicGpus.length === 0 && !loadingGpus}
                    />

                    <div className="grid gap-2.5 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="framework">Framework</Label>
                        <Select
                          id="framework"
                          variant="dashboard"
                          value={imageSelection?.key ?? ""}
                          onChange={(event) => setSelectedImageKey(event.target.value)}
                        >
                          {frameworkOptions.map((option) => (
                            <option key={option.key} value={option.key}>{option.label}</option>
                          ))}
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="gpu-count">GPU Count</Label>
                        <Input
                          id="gpu-count"
                          type="number"
                          min={1}
                          max={maxGPUs}
                          variant="dashboard"
                          value={String(envGPUCount)}
                          onChange={(event) => setExplicitEnvGPUCount(event.target.value)}
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      variant="dashboard-primary"
                      disabled={busy || dynamicGpus.length === 0 || !imageSelection}
                    >
                      {busy ? "Saving..." : "Create environment"}
                    </Button>
                  </form>
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
