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
import { Database, Key, LogOut, Play, Server, Settings, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type FormEvent } from "react"

type MainSection = "data" | "environments" | "runs"
type UtilitySection = "settings"

type GPUInfo = { id: string; displayName: string; memoryInGb: number; maxGpuCount: number }

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [activeSection, setActiveSection] = useState<MainSection | UtilitySection>("environments")

  const [explicitEnvGPUType, setExplicitEnvGPUType] = useState("")
  const [explicitEnvGPUCount, setExplicitEnvGPUCount] = useState("")
  const [envName, setEnvName] = useState("Frontier Runtime")
  const [envVolume, setEnvVolume] = useState("120")
  const [framework, setFramework] = useState("pt")
  const [explicitFrameworkVersion, setExplicitFrameworkVersion] = useState("")

  const primaryNav: { id: MainSection; label: string; icon: typeof Database }[] = [
    { id: "data", label: "Data", icon: Database },
    { id: "environments", label: "Environments", icon: Server },
    { id: "runs", label: "Runs", icon: Play },
  ]

  const catalog = useQuery(api.catalog.getCatalog)
  const getDynamicGpus = useAction(api.catalog.getDynamicGpus)
  const currentUser = useQuery(api.auth.getCurrentUser)
  const envResult = useQuery(api.environments.list)
  const runResult = useQuery(api.runs.list)

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

  const environments = envResult?.environments ?? []
  const runs = runResult?.runs ?? []

  const createEnvMutation = useMutation(api.environments.create)
  const removeEnvMutation = useMutation(api.environments.remove)
  const createRunMutation = useMutation(api.runs.create)
  const removeRunMutation = useMutation(api.runs.remove)

  const frameworkVersions = useMemo(() => {
    if (!catalog) return []
    return Object.keys(catalog.images[framework] || {})
  }, [catalog, framework])

  const currentGpusList = dynamicGpus
  const envGPUType = explicitEnvGPUType || (currentGpusList.length ? currentGpusList[0].id : "")

  const selectedGPU = useMemo(() => {
    return currentGpusList.find((g) => g.id === envGPUType) ?? null
  }, [currentGpusList, envGPUType])

  const maxGPUs = selectedGPU?.maxGpuCount || 8
  const rawGPUCount = explicitEnvGPUCount || "1"
  const envGPUCountValidation = Number.parseInt(rawGPUCount, 10)
  const envGPUCount = envGPUCountValidation > maxGPUs ? String(maxGPUs) : rawGPUCount

  const frameworkVersion = explicitFrameworkVersion || (frameworkVersions.length ? frameworkVersions[0] : "")

  const dataRows = useMemo(() => {
    return [
      ...environments.map((env) => ({
        kind: "Environment artifacts",
        owner: env.environment_id,
        path: env.artifacts,
      })),
      ...runs.flatMap((run) => [
        { kind: "Run input", owner: run.run_id, path: run.input },
        { kind: "Run output", owner: run.run_id, path: run.output },
        { kind: "Run logs", owner: run.run_id, path: run.logs },
      ]),
    ]
  }, [environments, runs])

  const userEmail = currentUser?.email ?? ""

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
        name: envName,
        gpu_type: envGPUType,
        gpu_count: Number.parseInt(envGPUCount, 10),
        volume_gb: Number.parseInt(envVolume, 10),
        framework,
        version: frameworkVersion,
      })
      setMessage("Environment created.")
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
            <section>
              <SectionHeading variant="medium" className="mb-2">Data</SectionHeading>
              <p className="text-base text-muted-foreground mb-10">Backend-backed storage references for environments and runs.</p>

              {dataRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">No data assets yet. Create an environment or run first.</p>
              ) : (
                <Card className="overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Type</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Owner</th>
                        <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataRows.map((row) => (
                        <tr key={`${row.kind}-${row.owner}-${row.path}`} className="border-b last:border-b-0 border-border/40">
                          <td className="px-4 py-3 text-sm">{row.kind}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.owner}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.path}</td>
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
                  <div className="space-y-2">
                    <Label htmlFor="env-name">Name</Label>
                    <Input id="env-name" value={envName} onChange={(event) => setEnvName(event.target.value)} required />
                  </div>

                  <MachineSelector
                    machines={currentGpusList}
                    value={envGPUType}
                    loading={loadingGpus}
                    onChange={setExplicitEnvGPUType}
                    disabled={currentGpusList.length === 0 && !loadingGpus}
                  />

                  <div className="grid gap-3 xl:grid-cols-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="framework">Framework</Label>
                      <Select
                        id="framework"
                        value={framework}
                        onChange={(event) => setFramework(event.target.value)}
                      >
                        {Object.keys(catalog?.images || {}).map((key) => (
                          <option key={key} value={key}>{key}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="version">Version</Label>
                      <Select
                        id="version"
                        value={frameworkVersion}
                        onChange={(event) => setExplicitFrameworkVersion(event.target.value)}
                      >
                        {frameworkVersions.map((version) => (
                          <option key={version} value={version}>{version}</option>
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
                    <div className="space-y-2">
                      <Label htmlFor="volume">Volume (GB)</Label>
                      <Input id="volume" type="number" min={1} value={envVolume} onChange={(event) => setEnvVolume(event.target.value)} />
                    </div>
                  </div>

                  <Button type="submit" disabled={busy || currentGpusList.length === 0}>{busy ? "Saving..." : "Create environment"}</Button>
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
