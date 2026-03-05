"use client"

import { Badge, statusVariant } from "@/components/ui/badge"
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
  AppWindow,
  ArrowRight,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronsLeft,
  Database,
  Download,
  ImageIcon,
  Key,
  List,
  LogOut,
  MessageSquare,
  Mic,
  Play,
  Plus,
  Server,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type FormEvent } from "react"

type MainSection = "chat" | "data" | "environments" | "runs"
type UtilitySection = "settings"
type PlaceholderSection =
  | "agent-builder"
  | "audio"
  | "images"
  | "videos"
  | "assistants"
  | "usage"
  | "chatgpt-apps"
  | "logs"
  | "batches"
  | "evaluation"
  | "fine-tuning"

type DashboardSection = MainSection | UtilitySection | PlaceholderSection

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
  id: DashboardSection
  label: string
  icon: React.ComponentType<{ className?: string }>
  href?: string
}

function formatBytes(size: number) {
  if (size <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** unitIndex
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function pageTitle(section: DashboardSection) {
  switch (section) {
    case "chat":
      return "Chat prompts"
    case "data":
      return "Storage"
    case "environments":
      return "Environments"
    case "runs":
      return "Batches"
    case "settings":
      return "Settings"
    case "agent-builder":
      return "Agent Builder"
    case "audio":
      return "Audio"
    case "images":
      return "Images"
    case "videos":
      return "Videos"
    case "assistants":
      return "Assistants"
    case "usage":
      return "Usage"
    case "chatgpt-apps":
      return "ChatGPT Apps"
    case "logs":
      return "Logs"
    case "batches":
      return "Batches"
    case "evaluation":
      return "Evaluation"
    case "fine-tuning":
      return "Fine-tuning"
    default:
      return "Dashboard"
  }
}

function SidebarSection({ label, items, activeSection, onSelect }: {
  label: string
  items: SidebarItem[]
  activeSection: DashboardSection
  onSelect: (section: DashboardSection) => void
}) {
  return (
    <div>
      <div className="px-2 pb-1 pt-2 text-[11px] font-medium tracking-[0.01em] text-[#8e8ea0]">{label}</div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const active = activeSection === item.id
          const Icon = item.icon

          if (item.href) {
            return (
              <Link
                key={item.id}
                href={item.href}
                className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] text-[#6e6e80] transition hover:bg-[#f4f4f4] hover:text-[#0d0d0d]"
              >
                <Icon className="h-[15px] w-[15px]" />
                {item.label}
              </Link>
            )
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px] transition ${
                active
                  ? "bg-[#ececec] font-medium text-[#0d0d0d]"
                  : "text-[#6e6e80] hover:bg-[#f4f4f4] hover:text-[#0d0d0d]"
              }`}
            >
              <Icon className="h-[15px] w-[15px]" />
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[#e5e5e5] bg-white p-8 text-center">
      <p className="text-sm text-[#6e6e80]">{title} UI is not wired in this app yet.</p>
    </div>
  )
}

function ChatEmptyState() {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border-[1.5px] border-[#e5e5e5] text-[#8e8ea0]">
        <MessageSquare className="h-5 w-5" />
      </div>
      <div className="text-[15px] font-medium text-[#0d0d0d]">Create a chat prompt</div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0d0d0d] px-4 text-[13.5px] font-medium text-white transition hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          Create
        </button>
        <div className="flex h-9 items-center gap-1.5 rounded-full border border-[#e5e5e5] bg-white px-2 pl-3.5">
          <input
            placeholder="Generate..."
            className="w-28 border-0 bg-transparent text-[13.5px] text-[#8e8ea0] outline-none"
          />
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#8e8ea0] text-white transition hover:bg-[#555]"
          >
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {[
          "Trip planner",
          "Image generator",
          "Code debugger",
          "Research assistant",
          "Decision helper",
        ].map((tag) => (
          <button
            key={tag}
            type="button"
            className="rounded-full border border-[#d9d9e3] bg-white px-3.5 py-1.5 text-[13px] text-[#0d0d0d] transition hover:border-[#c5c5d2] hover:bg-[#f4f4f4]"
          >
            {tag}
          </button>
        ))}
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

  const [activeSection, setActiveSection] = useState<DashboardSection>("chat")

  const [explicitEnvGPUType, setExplicitEnvGPUType] = useState("")
  const [explicitEnvGPUCount, setExplicitEnvGPUCount] = useState("")
  const [selectedImageKey, setSelectedImageKey] = useState("")
  const [selectedDataFiles, setSelectedDataFiles] = useState<File[]>([])
  const [uploadingData, setUploadingData] = useState(false)
  const [dataFileInputKey, setDataFileInputKey] = useState(0)

  const createItems: SidebarItem[] = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "agent-builder", label: "Agent Builder", icon: Bot },
    { id: "audio", label: "Audio", icon: Mic },
    { id: "images", label: "Images", icon: ImageIcon },
    { id: "videos", label: "Videos", icon: Video },
    { id: "assistants", label: "Assistants", icon: Boxes },
  ]

  const manageItems: SidebarItem[] = [
    { id: "usage", label: "Usage", icon: BarChart3 },
    { id: "settings", label: "API keys", icon: Key, href: "/api-key" },
    { id: "chatgpt-apps", label: "ChatGPT Apps", icon: AppWindow },
    { id: "logs", label: "Logs", icon: List },
    { id: "data", label: "Storage", icon: Database },
    { id: "environments", label: "Batches", icon: Server },
  ]

  const optimizeItems: SidebarItem[] = [
    { id: "evaluation", label: "Evaluation", icon: CheckCircle2 },
    { id: "runs", label: "Fine-tuning", icon: SlidersHorizontal },
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
      <div className="flex h-full">
        <aside className="flex h-full w-[168px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[#e5e5e5] bg-white p-2">
          <SidebarSection label="Create" items={createItems} activeSection={activeSection} onSelect={setActiveSection} />

          <div className="my-1 h-px bg-[#e5e5e5]" />
          <SidebarSection label="Manage" items={manageItems} activeSection={activeSection} onSelect={setActiveSection} />

          <div className="my-1 h-px bg-[#e5e5e5]" />
          <SidebarSection label="Optimize" items={optimizeItems} activeSection={activeSection} onSelect={setActiveSection} />

          <div className="mt-auto pt-2">
            <button
              type="button"
              onClick={logout}
              className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-[#6e6e80] transition hover:bg-[#f4f4f4] hover:text-[#0d0d0d]"
            >
              <LogOut className="h-[15px] w-[15px]" />
              Sign out
            </button>
            <button
              type="button"
              className="mt-0.5 flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px] text-[#6e6e80] transition hover:bg-[#f4f4f4] hover:text-[#0d0d0d]"
            >
              <ChevronsLeft className="h-[15px] w-[15px]" />
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#e5e5e5] px-5">
            <div className="flex items-center gap-1.5 text-[13.5px] text-[#6e6e80]">
              <button type="button" className="flex items-center gap-1 text-[#0d0d0d]">
                <div className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-[#0d0d0d] text-white">
                  <Sparkles className="h-3 w-3" />
                </div>
                <span className="font-medium">Personal</span>
                <ChevronDown className="h-3 w-3 text-[#aaa]" />
              </button>
              <span className="px-0.5 text-base font-light text-[#e5e5e5]">/</span>
              <button type="button" className="flex items-center gap-1 hover:text-[#0d0d0d]">
                <span>Default project</span>
                <ChevronDown className="h-3 w-3 text-[#aaa]" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              <button type="button" className="text-[13.5px] text-[#6e6e80] transition hover:text-[#0d0d0d]">Dashboard</button>
              <a href="https://platform.openai.com/docs" target="_blank" rel="noreferrer" className="text-[13.5px] text-[#6e6e80] transition hover:text-[#0d0d0d]">API Docs</a>
              <button type="button" onClick={() => setActiveSection("settings")} className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-[#6e6e80] transition hover:bg-[#f4f4f4] hover:text-[#0d0d0d]">
                <Settings className="h-4 w-4" />
              </button>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#19c37d] text-xs font-semibold text-white">{userInitial}</div>
            </div>
          </header>

          <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6">
            <h1 className="mb-6 text-[17px] font-semibold">{pageTitle(activeSection)}</h1>

            {error ? <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            {message ? <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center pb-8">
              {activeSection === "chat" ? <ChatEmptyState /> : null}

              {activeSection === "data" ? (
                <section className="space-y-4">
                  <Card className="border-[#e5e5e5] p-5">
                    <h3 className="text-sm font-semibold">Ingest data</h3>
                    <form onSubmit={uploadData} className="mt-4 space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="data-file">Files</Label>
                        <Input
                          key={dataFileInputKey}
                          id="data-file"
                          type="file"
                          multiple
                          disabled={uploadingData}
                          onChange={(event) => setSelectedDataFiles(Array.from(event.target.files ?? []))}
                        />
                      </div>
                      {selectedDataFiles.length > 0 ? (
                        <div className="rounded-lg border border-[#e5e5e5] p-3">
                          {selectedDataFiles.map((file) => (
                            <p key={`${file.name}-${file.size}-${file.lastModified}`} className="text-sm text-[#6e6e80]">
                              {file.name} ({formatBytes(file.size)})
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <button
                        type="submit"
                        disabled={selectedDataFiles.length === 0 || uploadingData}
                        className="inline-flex h-9 items-center rounded-md bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {uploadingData ? "Uploading..." : "Ingest data"}
                      </button>
                    </form>
                  </Card>

                  <Card className="overflow-hidden border-[#e5e5e5]">
                    {dataBlobs.length === 0 ? (
                      <p className="p-5 text-sm text-[#6e6e80]">No ingested files yet.</p>
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
                              <td className="px-4 py-3 text-[#6e6e80]">{formatBytes(blob.size)}</td>
                              <td className="px-4 py-3 text-[#6e6e80]">{new Date(blob.created_at).toLocaleString()}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <a href={blob.download_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border border-[#e5e5e5] px-2.5 text-[#0d0d0d]">
                                    <Download className="h-3.5 w-3.5" />
                                    Open
                                  </a>
                                  <button type="button" onClick={() => deleteDataBlob(blob.key, blob.blob_id)} disabled={busy} className="inline-flex h-8 items-center rounded-md border border-[#e5e5e5] px-2 text-[#0d0d0d] disabled:opacity-40">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
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
                  <Card className="border-[#e5e5e5] p-5">
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
                          <Select id="framework" value={imageSelection?.key ?? ""} onChange={(event) => setSelectedImageKey(event.target.value)}>
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
                            value={envGPUCount}
                            onChange={(event) => setExplicitEnvGPUCount(event.target.value)}
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={busy || currentGpusList.length === 0 || !imageSelection}
                        className="inline-flex h-9 items-center rounded-md bg-[#0d0d0d] px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busy ? "Saving..." : "Create environment"}
                      </button>
                    </form>
                  </Card>

                  <Card className="overflow-hidden border-[#e5e5e5]">
                    {environments.length === 0 ? (
                      <p className="p-5 text-sm text-[#6e6e80]">No environments yet.</p>
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
                              <td className="px-4 py-3 text-[#6e6e80]">{env.framework}:{env.version} | {env.gpu_type} x{env.gpu_count} | {env.volume_gb}GB</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={() => launchRun(env.environment_id)} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#e5e5e5] px-2.5 disabled:opacity-40">
                                    <Play className="h-3.5 w-3.5" />
                                    Run
                                  </button>
                                  <button type="button" onClick={() => deleteEnvironment(env.environment_id)} disabled={busy} className="inline-flex h-8 items-center rounded-md border border-[#e5e5e5] px-2 disabled:opacity-40">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
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
                  <Card className="overflow-hidden border-[#e5e5e5]">
                    {environments.length === 0 ? (
                      <p className="p-5 text-sm text-[#6e6e80]">Create an environment first to launch runs.</p>
                    ) : runs.length === 0 ? (
                      <p className="p-5 text-sm text-[#6e6e80]">No runs yet. Go to Batches and start one.</p>
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
                                <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">{run.env_id}</td>
                              <td className="px-4 py-3 text-[#6e6e80]">{run.effective_gpu_type || "-"} / {run.effective_gpu_count || "-"} / {run.effective_volume_gb || "-"}GB</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  disabled={busy || !["queued", "provisioning", "running", "cancelling"].includes(run.status)}
                                  onClick={() => cancelRun(run.run_id)}
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-[#e5e5e5] px-2.5 disabled:opacity-40"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Cancel
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Card>
                </section>
              ) : null}

              {activeSection === "settings" ? <PlaceholderView title="Settings" /> : null}

              {[
                "agent-builder",
                "audio",
                "images",
                "videos",
                "assistants",
                "usage",
                "chatgpt-apps",
                "logs",
                "batches",
                "evaluation",
                "fine-tuning",
              ].includes(activeSection) ? <PlaceholderView title={pageTitle(activeSection)} /> : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
