"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MachineSelector } from "@/components/machine-selector"
import { Select } from "@/components/ui/select"
import { PageLoader } from "@/components/ui/spinner"
import { api } from "@convex/_generated/api"
import { authClient } from "@/lib/auth-client"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import {
  Database,
  Download,
  Key,
  LogOut,
  Play,
  Server,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type FormEvent } from "react"

type MainSection = "data" | "environments" | "runs"

type GPUInfo = { id: string; displayName: string; memoryInGb: number; maxGpuCount: number; pricePerHour?: number | null }
type CatalogData = { images: Record<string, Record<string, string>> }
type DataBlob = {
  blob_id: string
  filename: string
  key: string
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

type SidebarItem = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  section?: MainSection
  href?: string
}

function formatBytes(size: number) {
  if (size <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** unitIndex
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function pageTitle(section: MainSection) {
  switch (section) {
    case "data":
      return "Storage"
    case "environments":
      return "Environments"
    case "runs":
      return "Runs"
    default:
      return "Dashboard"
  }
}

function SidebarSection({ label, items, activeSection, onSelect }: {
  label: string
  items: SidebarItem[]
  activeSection: MainSection
  onSelect: (section: MainSection) => void
}) {
  return (
    <div>
      <div className="px-2 pb-1 pt-2 text-[11px] font-medium tracking-[0.01em] text-[#8e8ea0]">{label}</div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const active = item.section ? activeSection === item.section : false
          const Icon = item.icon

          if (item.href) {
            return (
              <Button key={item.id} asChild variant="ghost" className="h-8 w-full justify-start gap-2.5 px-2 text-[13.5px] font-normal text-[#6e6e80] hover:bg-[#f4f4f4] hover:text-[#0d0d0d]">
                <Link href={item.href}>
                  <Icon className="h-[15px] w-[15px]" />
                  {item.label}
                </Link>
              </Button>
            )
          }

          return (
            <Button
              key={item.id}
              type="button"
              variant="ghost"
              onClick={() => onSelect(item.section!)}
              className={`h-8 w-full justify-start gap-2.5 px-2 text-left text-[13.5px] font-normal transition ${
                active
                  ? "bg-[#ececec] font-medium text-[#0d0d0d]"
                  : "text-[#6e6e80] hover:bg-[#f4f4f4] hover:text-[#0d0d0d]"
              }`}
            >
              <Icon className="h-[15px] w-[15px]" />
              {item.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [activeSection, setActiveSection] = useState<MainSection>("environments")

  const [explicitEnvGPUType, setExplicitEnvGPUType] = useState("")
  const [explicitEnvGPUCount, setExplicitEnvGPUCount] = useState("")
  const [selectedImageKey, setSelectedImageKey] = useState("")
  const [selectedDataFiles, setSelectedDataFiles] = useState<File[]>([])
  const [uploadingData, setUploadingData] = useState(false)
  const [dataFileInputKey, setDataFileInputKey] = useState(0)

  const featureItems: SidebarItem[] = [
    { id: "data", label: "Storage", icon: Database, section: "data" },
    { id: "environments", label: "Environments", icon: Server, section: "environments" },
    { id: "runs", label: "Runs", icon: Play, section: "runs" },
  ]

  const utilityItems: SidebarItem[] = [
    { id: "api-keys", label: "API keys", icon: Key, href: "/api-key" },
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
  const userInitial = userEmail.trim().charAt(0).toUpperCase() || "U"
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unexpected error"
      setError(msg === "Failed to fetch" ? "Upload failed. Check the R2 bucket CORS policy for PUT requests from this app origin." : msg)
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
    <div className="h-screen overflow-hidden bg-white text-[#0d0d0d]" style={{ fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
      <header className="flex h-12 items-center justify-between border-b border-[#e5e5e5] px-5">
        <div className="flex items-center gap-1.5 text-[13.5px] text-[#6e6e80]">
          <div className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-[#0d0d0d] text-white">
            <Sparkles className="h-3 w-3" />
          </div>
          <span className="font-medium text-[#0d0d0d]">Dashboard</span>
        </div>

        <div className="flex items-center gap-4">
          <Button type="button" variant="ghost" className="h-auto px-0 text-[13.5px] font-normal text-[#6e6e80] hover:bg-transparent hover:text-[#0d0d0d]">Dashboard</Button>
          <Button asChild variant="ghost" className="h-auto px-0 text-[13.5px] font-normal text-[#6e6e80] hover:bg-transparent hover:text-[#0d0d0d]">
            <a href="https://platform.openai.com/docs" target="_blank" rel="noreferrer">API Docs</a>
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push("/api-key")} className="h-[30px] w-[30px] p-0 text-[#6e6e80] hover:bg-[#f4f4f4] hover:text-[#0d0d0d]">
            <Settings className="h-4 w-4" />
          </Button>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0d0d0d] text-xs font-semibold text-white">{userInitial}</div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-3rem)]">
        <aside className="flex h-full w-[168px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[#e5e5e5] bg-white p-2">
          <SidebarSection label="Features" items={featureItems} activeSection={activeSection} onSelect={setActiveSection} />
          <div className="my-1 h-px bg-[#e5e5e5]" />
          <SidebarSection label="Account" items={utilityItems} activeSection={activeSection} onSelect={setActiveSection} />

          <div className="mt-auto pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={logout}
              className="h-8 w-full justify-start gap-2.5 px-2 text-[13px] font-normal text-[#6e6e80] hover:bg-[#f4f4f4] hover:text-[#0d0d0d]"
            >
              <LogOut className="h-[15px] w-[15px]" />
              Sign out
            </Button>
          </div>
        </aside>

        <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6">
            <h1 className="mb-6 text-[17px] font-semibold">{pageTitle(activeSection)}</h1>

            {error ? <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            {message ? <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">{message}</p> : null}

            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center pb-8">
              {activeSection === "data" ? (
                <section className="space-y-4">
                  <Card className="border-[#e5e5e5] bg-white p-5 text-[#0d0d0d]">
                    <h3 className="text-sm font-semibold">Ingest data</h3>
                    <form onSubmit={uploadData} className="mt-4 space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="data-file">Files</Label>
                        <Input
                          key={dataFileInputKey}
                          id="data-file"
                          type="file"
                          className="rounded-md border-[#e5e5e5] bg-white px-3 font-sans text-[#0d0d0d]"
                          multiple
                          disabled={uploadingData}
                          onChange={(event) => setSelectedDataFiles(Array.from(event.target.files ?? []))}
                        />
                      </div>
                      {selectedDataFiles.length > 0 ? (
                        <div className="rounded-lg border border-border p-3">
                          {selectedDataFiles.map((file) => (
                            <p key={`${file.name}-${file.size}-${file.lastModified}`} className="text-sm text-muted-foreground">
                              {file.name} ({formatBytes(file.size)})
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <Button
                        type="submit"
                        disabled={selectedDataFiles.length === 0 || uploadingData}
                        className="bg-[#0d0d0d] text-white hover:bg-[#222]"
                      >
                        {uploadingData ? "Uploading..." : "Ingest data"}
                      </Button>
                    </form>
                  </Card>

                  <Card className="overflow-hidden border-[#e5e5e5] bg-white text-[#0d0d0d]">
                    {dataBlobs.length === 0 ? (
                      <p className="p-5 text-sm text-muted-foreground">No ingested files yet.</p>
                    ) : (
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-[#e5e5e5] text-[#6e6e80]">
                          <tr>
                            <th className="px-4 py-3 font-medium">File</th>
                            <th className="px-4 py-3 font-medium">Size</th>
                            <th className="px-4 py-3 font-medium">Uploaded</th>
                            <th className="px-4 py-3 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dataBlobs.map((blob) => (
                            <tr key={blob.key} className="border-b border-[#f1f1f1] last:border-0">
                              <td className="px-4 py-3">{blob.filename}</td>
                              <td className="px-4 py-3 text-muted-foreground">{formatBytes(blob.size)}</td>
                              <td className="px-4 py-3 text-muted-foreground">{new Date(blob.created_at).toLocaleString()}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Button asChild type="button" variant="outline" size="sm">
                                    <a href={blob.download_url} target="_blank" rel="noreferrer">
                                      <Download className="h-3.5 w-3.5" />
                                      Open
                                    </a>
                                  </Button>
                                  <Button type="button" variant="outline" size="sm" onClick={() => deleteDataBlob(blob.key, blob.blob_id)} disabled={busy} className="px-2">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Card>
                </section>
              ) : null}

              {activeSection === "environments" ? (
                <section className="space-y-4">
                  <Card className="border-[#e5e5e5] bg-white p-5 text-[#0d0d0d]">
                    <form onSubmit={createEnvironment} className="space-y-4">
                      <MachineSelector
                        machines={currentGpusList}
                        value={envGPUType}
                        loading={loadingGpus}
                        onChange={setExplicitEnvGPUType}
                        disabled={currentGpusList.length === 0 && !loadingGpus}
                      />

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="framework">Framework</Label>
                          <Select
                            id="framework"
                            value={imageSelection?.key ?? ""}
                            className="rounded-md border-[#e5e5e5] bg-white px-3 font-sans text-[#0d0d0d]"
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
                            className="rounded-md border-[#e5e5e5] bg-white px-3 font-sans text-[#0d0d0d]"
                            value={envGPUCount}
                            onChange={(event) => setExplicitEnvGPUCount(event.target.value)}
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        disabled={busy || currentGpusList.length === 0 || !imageSelection}
                        className="bg-[#0d0d0d] text-white hover:bg-[#222]"
                      >
                        {busy ? "Saving..." : "Create environment"}
                      </Button>
                    </form>
                  </Card>

                  <Card className="overflow-hidden border-[#e5e5e5] bg-white text-[#0d0d0d]">
                    {environments.length === 0 ? (
                      <p className="p-5 text-sm text-muted-foreground">No environments yet.</p>
                    ) : (
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-[#e5e5e5] text-[#6e6e80]">
                          <tr>
                            <th className="px-4 py-3 font-medium">ID</th>
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">Spec</th>
                            <th className="px-4 py-3 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {environments.map((env) => (
                            <tr key={env.environment_id} className="border-b border-[#f1f1f1] last:border-0">
                              <td className="px-4 py-3 font-mono text-xs">{env.environment_id}</td>
                              <td className="px-4 py-3">{env.name}</td>
                              <td className="px-4 py-3 text-muted-foreground">{env.framework}:{env.version} | {env.gpu_type} x{env.gpu_count} | {env.volume_gb}GB</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Button type="button" variant="outline" size="sm" onClick={() => launchRun(env.environment_id)} disabled={busy}>
                                    <Play className="h-3.5 w-3.5" />
                                    Run
                                  </Button>
                                  <Button type="button" variant="outline" size="sm" onClick={() => deleteEnvironment(env.environment_id)} disabled={busy} className="px-2">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Card>
                </section>
              ) : null}

              {activeSection === "runs" ? (
                <section className="space-y-4">
                  <Card className="overflow-hidden border-[#e5e5e5] bg-white text-[#0d0d0d]">
                    {environments.length === 0 ? (
                      <p className="p-5 text-sm text-muted-foreground">Create an environment first to launch runs.</p>
                    ) : runs.length === 0 ? (
                      <p className="p-5 text-sm text-muted-foreground">No runs yet. Go to Runs and start one.</p>
                    ) : (
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-[#e5e5e5] text-[#6e6e80]">
                          <tr>
                            <th className="px-4 py-3 font-medium">Run</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium">Environment</th>
                            <th className="px-4 py-3 font-medium">Infra</th>
                            <th className="px-4 py-3 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runs.map((run) => (
                            <tr key={run.run_id} className="border-b border-[#f1f1f1] last:border-0 align-top">
                              <td className="px-4 py-3 font-mono text-xs">{run.run_id}</td>
                              <td className="px-4 py-3">
                                <Badge variant="default" className="rounded-full px-2.5 py-1 text-[11px] capitalize tracking-normal">{run.status}</Badge>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">{run.env_id}</td>
                              <td className="px-4 py-3 text-muted-foreground">{run.effective_gpu_type || "-"} / {run.effective_gpu_count || "-"} / {run.effective_volume_gb || "-"}GB</td>
                              <td className="px-4 py-3">
                                <Button
                                  type="button"
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
                    )}
                  </Card>
                </section>
              ) : null}

            </div>
        </main>
      </div>
    </div>
  )
}
