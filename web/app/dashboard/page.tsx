"use client"

import { MachineSelector } from "@/components/machine-selector"
import { SectionHeading } from "@/components/section-heading"
import { Badge, statusVariant } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { PageLoader } from "@/components/ui/spinner"
import { api } from "@/convex/_generated/api"
import { authClient } from "@/lib/auth-client"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import { Database, Download, Key, LogOut, Play, Server, Settings, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type FormEvent } from "react"

type MainSection = "data" | "environments" | "runs"
type UtilitySection = "settings"

type GPUInfo = { id: string; displayName: string; memoryInGb: number; maxGpuCount: number; pricePerHour?: number | null }
type CatalogData = { images: Record<string, Record<string, string>> }
type DataBlob = {
  data_blob_id: string
  blob_id: string
  filename: string
  content_type: string
  size: number
  download_url: string
  created_at: number
}
type EnvironmentRow = {
  environment_id: string
  name: string
  artifacts: string
  gpu_type: string
  gpu_count: number
  volume_gb: number
  framework: string
  version: string
}
type RunRow = {
  run_id: string
  env_id: string
  input: string
  output: string
  logs: string
  status: string
  error: string
  pod_id: string
  effective_gpu_type: string
  effective_gpu_count: number
  effective_volume_gb: number
  cancellation_requested: boolean
}

function formatBytes(size: number) {
  if (size <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** unitIndex
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [activeSection, setActiveSection] = useState<MainSection | UtilitySection>("environments")

  const [explicitEnvGPUType, setExplicitEnvGPUType] = useState("")
  const [explicitEnvGPUCount, setExplicitEnvGPUCount] = useState("")
  const [selectedImageKey, setSelectedImageKey] = useState("")
  const [selectedDataFile, setSelectedDataFile] = useState<File | null>(null)
  const [uploadingData, setUploadingData] = useState(false)
  const [dataFileInputKey, setDataFileInputKey] = useState(0)

  const primaryNav: { id: MainSection; label: string; icon: typeof Database }[] = [
    { id: "data", label: "Data", icon: Database },
    { id: "environments", label: "Environments", icon: Server },
    { id: "runs", label: "Runs", icon: Play },
  ]

  const catalog = useQuery(api.catalog.getCatalog) as CatalogData | undefined
  const getDynamicGpus = useAction(api.catalog.getDynamicGpus)
  const currentUser = useQuery(api.auth.getCurrentUser)
  const dataResult = useQuery(api.data.list) as { blobs: DataBlob[] } | undefined
  const envResult = useQuery(api.environments.list) as { environments: EnvironmentRow[] } | undefined
  const runResult = useQuery(api.runs.list) as { runs: RunRow[] } | undefined

  const [dynamicGpus, setDynamicGpus] = useState<GPUInfo[]>([])
  const [loadingGpus, setLoadingGpus] = useState(true)

  useEffect(() => {
    async function fetchGpus() {
      try {
        setLoadingGpus(true)
        const gpus = await getDynamicGpus()
        setDynamicGpus(gpus)
      } catch (err) {
        console.error("Failed to fetch dynamic gpus", err)
      } finally {
        setLoadingGpus(false)
      }
    }

    if (isAuthenticated) {
      fetchGpus()
    }
  }, [getDynamicGpus, isAuthenticated])

  const environments: EnvironmentRow[] = envResult?.environments ?? []
  const runs: RunRow[] = runResult?.runs ?? []

  const createEnvMutation = useMutation(api.environments.create)
  const ingestDataAction = useAction(api.data.ingest)
  const removeDataBlobMutation = useMutation(api.data.remove)
  const removeEnvMutation = useMutation(api.environments.remove)
  const createRunMutation = useMutation(api.runs.create)
  const removeRunMutation = useMutation(api.runs.remove)

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

  const currentGpusList = dynamicGpus
  const envGPUType = explicitEnvGPUType || (currentGpusList.length ? currentGpusList[0].id : "")

  const selectedGPU = useMemo(() => {
    return currentGpusList.find((g) => g.id === envGPUType) ?? null
  }, [currentGpusList, envGPUType])

  const maxGPUs = selectedGPU?.maxGpuCount || 8
  const rawGPUCount = explicitEnvGPUCount || "1"
  const envGPUCountValidation = Number.parseInt(rawGPUCount, 10)
  const envGPUCount = envGPUCountValidation > maxGPUs ? String(maxGPUs) : rawGPUCount

  const imageSelection = useMemo(() => {
    return frameworkOptions.find((option) => option.key === selectedImageKey) ?? frameworkOptions[0] ?? null
  }, [frameworkOptions, selectedImageKey])

  const environmentName = useMemo(() => {
    const machineLabel = selectedGPU?.displayName ?? "Training"
    const frameworkLabel = imageSelection?.label ?? "Environment"
    return `${machineLabel} · ${frameworkLabel}`
  }, [imageSelection, selectedGPU])

  const userEmail = currentUser?.email ?? ""
  const dataBlobs: DataBlob[] = dataResult?.blobs ?? []

  async function withBusy(task: () => Promise<void>) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await task()
    } catch (err) {
      setError(err instanceof Error ? err.message : "unexpected error")
    } finally {
      setBusy(false)
    }
  }

  async function createEnvironment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await withBusy(async () => {
      await createEnvMutation({
        name: environmentName,
        gpu_type: envGPUType,
        gpu_count: Number.parseInt(envGPUCount, 10),
        volume_gb: 120,
        framework: imageSelection?.framework ?? "pt",
        version: imageSelection?.version ?? "",
      })
      setMessage("Environment created.")
    })
  }

  async function uploadData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedDataFile) return

    const file = selectedDataFile
    setUploadingData(true)
    setError("")
    setMessage("")

    try {
      const bytes = await file.arrayBuffer()
      await ingestDataAction({
        filename: file.name,
        contentType: file.type || undefined,
        bytes,
      })

      setSelectedDataFile(null)
      setDataFileInputKey((current) => current + 1)
      setMessage(`Uploaded ${file.name}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "unexpected error")
    } finally {
      setUploadingData(false)
    }
  }

  async function deleteDataBlob(dataBlobId: string, filename: string) {
    await withBusy(async () => {
      await removeDataBlobMutation({ dataBlobId: dataBlobId as any })
      setMessage(`Deleted ${filename}.`)
    })
  }

  async function deleteEnvironment(envID: string) {
    await withBusy(async () => {
      await removeEnvMutation({ environmentId: envID as any })
      setMessage(`Environment ${envID} deleted.`)
    })
  }

  async function launchRun(envID: string) {
    await withBusy(async () => {
      await createRunMutation({ environmentId: envID as any })
      setMessage("Run launched.")
    })
  }

  async function cancelRun(runID: string) {
    await withBusy(async () => {
      await removeRunMutation({ runId: runID as any })
      setMessage(`Run ${runID} cancellation requested.`)
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
    <div className="min-h-screen text-foreground bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-background">
        <div className="px-5 pt-7 pb-5">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/90 font-semibold">Tahuna</p>
          <p className="mt-1.5 text-sm text-muted-foreground truncate">{userEmail}</p>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {primaryNav.map((item) => {
            const Icon = item.icon
            const active = activeSection === item.id
            return (
              <Button
                key={item.id}
                variant={active ? "sidebar-active" : "sidebar"}
                onClick={() => setActiveSection(item.id)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Button>
            )
          })}
        </nav>

        <div className="border-t border-border px-4 py-4 space-y-1">
          <Button variant="sidebar" asChild>
            <Link href="/api-key">
              <Key className="h-4 w-4 shrink-0" />
              API Key
            </Link>
          </Button>
          <Button
            variant={activeSection === "settings" ? "sidebar-active" : "sidebar"}
            onClick={() => setActiveSection("settings")}
          >
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </Button>
          <Button
            variant="sidebar-danger"
            onClick={logout}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Logout
          </Button>
        </div>
      </aside>

      <main className="ml-64 min-h-screen">
        <div className="px-10 py-10 max-w-6xl">
          {error ? <p className="mb-6 rounded-md border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
          {message ? <p className="mb-6 rounded-md border border-primary/50 bg-primary/10 px-4 py-3 text-sm text-primary">{message}</p> : null}

          {activeSection === "data" ? (
            <section className="space-y-8">
              <div>
                <SectionHeading variant="medium" className="mb-2">Data</SectionHeading>
                <p className="text-base text-muted-foreground">Ingest files into managed storage and review everything uploaded for this user.</p>
              </div>

              <Card className="max-w-3xl p-6">
                <h3 className="text-lg font-semibold text-foreground">Ingest data</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Files are uploaded through Tahuna and attached to your account.
                </p>

                <form onSubmit={uploadData} className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="data-file">File</Label>
                    <Input
                      key={dataFileInputKey}
                      id="data-file"
                      type="file"
                      disabled={uploadingData}
                      onChange={(event) => setSelectedDataFile(event.target.files?.[0] ?? null)}
                    />
                  </div>

                  {selectedDataFile ? (
                    <div className="rounded-xl border border-border/70 bg-background/45 px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{selectedDataFile.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatBytes(selectedDataFile.size)}{selectedDataFile.type ? ` | ${selectedDataFile.type}` : ""}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Choose a file to ingest.</p>
                  )}

                  <Button type="submit" disabled={!selectedDataFile || uploadingData}>
                    {uploadingData ? "Uploading..." : "Ingest data"}
                  </Button>
                </form>
              </Card>

              {dataBlobs.length === 0 ? (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">No ingested files yet.</p>
                </Card>
              ) : (
                <Card className="overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">File</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Size</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Uploaded</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataBlobs.map((blob) => (
                        <tr key={blob.data_blob_id} className="border-b last:border-b-0 border-border/40 align-top">
                          <td className="px-4 py-3">
                            <p className="text-sm text-foreground">{blob.filename}</p>
                            {blob.content_type ? <p className="mt-1 text-xs text-muted-foreground">{blob.content_type}</p> : null}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{formatBytes(blob.size)}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(blob.created_at).toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" asChild>
                                <a href={blob.download_url} target="_blank" rel="noreferrer">
                                  <Download className="h-3.5 w-3.5" />
                                  Open
                                </a>
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => deleteDataBlob(blob.data_blob_id, blob.filename)} disabled={busy}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </section>
          ) : null}

          {activeSection === "environments" ? (
            <section className="space-y-8">
              <div>
                <SectionHeading variant="medium" className="mb-2">Environments</SectionHeading>
                <p className="text-base text-muted-foreground">Create and manage your GPU-backed training environments.</p>
              </div>

              <Card className="p-6">
                <form onSubmit={createEnvironment} className="space-y-6">
                  <MachineSelector
                    machines={currentGpusList}
                    value={envGPUType}
                    loading={loadingGpus}
                    onChange={setExplicitEnvGPUType}
                    disabled={currentGpusList.length === 0 && !loadingGpus}
                  />

                  <div className="grid gap-3 xl:grid-cols-2 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="framework">Framework</Label>
                      <Select
                        id="framework"
                        value={imageSelection?.key ?? ""}
                        onChange={(event) => setSelectedImageKey(event.target.value)}
                      >
                        {frameworkOptions.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gpu-count">GPU Count</Label>
                      <Input
                        id="gpu-count"
                        type="number"
                        min={1}
                        max={maxGPUs}
                        value={envGPUCount}
                        onChange={(event) => setExplicitEnvGPUCount(event.target.value)}
                      />
                      {selectedGPU ? <p className="text-xs text-muted-foreground">Max for this machine: {selectedGPU.maxGpuCount}</p> : null}
                    </div>
                  </div>

                  <Button type="submit" disabled={busy || currentGpusList.length === 0 || !imageSelection}>
                    {busy ? "Saving..." : "Create environment"}
                  </Button>
                </form>
              </Card>

              {environments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No environments yet.</p>
              ) : (
                <Card className="overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">ID</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Name</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Spec</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {environments.map((env) => (
                        <tr key={env.environment_id} className="border-b last:border-b-0 border-border/40">
                          <td className="px-4 py-3 font-mono text-xs">{env.environment_id}</td>
                          <td className="px-4 py-3 text-sm">{env.name}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{env.framework}:{env.version} | {env.gpu_type} x{env.gpu_count} | {env.volume_gb}GB</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => launchRun(env.environment_id)} disabled={busy}>
                                <Play className="h-3.5 w-3.5" />
                                Run
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => deleteEnvironment(env.environment_id)} disabled={busy}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </section>
          ) : null}

          {activeSection === "runs" ? (
            <section>
              <SectionHeading variant="medium" className="mb-2">Runs</SectionHeading>
              <p className="text-base text-muted-foreground mb-10">Monitor your training runs. Launch a run from an environment.</p>

              {environments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">Create an environment first to launch runs.</p>
              ) : runs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">No runs yet. Go to Environments and hit Run to start one.</p>
              ) : (
                <Card className="overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Run</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Environment</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Effective Infra</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.run_id} className="border-b last:border-b-0 border-border/40 align-top">
                          <td className="px-4 py-3 font-mono text-xs">{run.run_id}</td>
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{run.env_id}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{run.effective_gpu_type || "-"} / {run.effective_gpu_count || "-"} / {run.effective_volume_gb || "-"}GB</td>
                          <td className="px-4 py-3">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || !["queued", "provisioning", "running", "cancelling"].includes(run.status)}
                              onClick={() => cancelRun(run.run_id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Cancel
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </section>
          ) : null}

          {activeSection === "settings" ? (
            <section>
              <SectionHeading variant="medium" className="mb-2">Settings</SectionHeading>
              <p className="text-base text-muted-foreground">Account and dashboard controls.</p>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  )
}
