"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageLoader } from "@/components/ui/spinner"
import { api } from "@/convex/_generated/api"
import { authClient } from "@/lib/auth-client"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { Database, Key, LogOut, Play, Server, Settings, Trash2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type FormEvent } from "react"

type RunOverride = {
  gpu_type: string
  gpu_count: string
  volume_gb: string
}

type MainSection = "data" | "environments" | "runs"
type UtilitySection = "settings"

const defaultOverride: RunOverride = {
  gpu_type: "",
  gpu_count: "",
  volume_gb: "",
}

function statusTone(status: string): string {
  if (status === "running" || status === "provisioning") return "text-emerald-300 border-emerald-600/50 bg-emerald-900/20"
  if (status === "queued" || status === "cancelling") return "text-amber-200 border-amber-500/40 bg-amber-900/20"
  if (status === "succeeded" || status === "completed") return "text-cyan-200 border-cyan-500/40 bg-cyan-900/20"
  if (status === "failed" || status === "cancelled") return "text-rose-200 border-rose-500/40 bg-rose-900/20"
  return "text-foreground/90 border-border bg-card/80"
}

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [activeSection, setActiveSection] = useState<MainSection | UtilitySection>("environments")

  const [envName, setEnvName] = useState("Frontier Runtime")
  const [envGPUType, setEnvGPUType] = useState("")
  const [envGPUCount, setEnvGPUCount] = useState("1")
  const [envVolume, setEnvVolume] = useState("120")
  const [framework, setFramework] = useState("pt")
  const [frameworkVersion, setFrameworkVersion] = useState("")

  const [runEnvID, setRunEnvID] = useState("")
  const [override, setOverride] = useState<RunOverride>(defaultOverride)

  const primaryNav: { id: MainSection; label: string; icon: typeof Database }[] = [
    { id: "data", label: "Data", icon: Database },
    { id: "environments", label: "Environments", icon: Server },
    { id: "runs", label: "Runs", icon: Play },
  ]

  // ---- Convex queries (reactive — auto-update) ----
  const catalog = useQuery(api.catalog.getCatalog)
  const currentUser = useQuery(api.auth.getCurrentUser)
  const envResult = useQuery(api.environments.list)
  const runResult = useQuery(api.runs.list)

  const environments = envResult?.environments ?? []
  const runs = runResult?.runs ?? []

  // ---- Convex mutations ----
  const createEnvMutation = useMutation(api.environments.create)
  const removeEnvMutation = useMutation(api.environments.remove)
  const createRunMutation = useMutation(api.runs.create)
  const removeRunMutation = useMutation(api.runs.remove)

  // ---- derived state ----
  const frameworkVersions = useMemo(() => {
    if (!catalog) return []
    return Object.keys(catalog.images[framework] || {})
  }, [catalog, framework])

  const selectedGPU = useMemo(() => {
    return catalog?.gpus.find((g) => g.id === envGPUType) ?? null
  }, [catalog, envGPUType])

  const maxGPUs = selectedGPU?.maxGpuCount || 8

  const selectedRunEnv = useMemo(() => {
    return environments.find((env) => env.environment_id === runEnvID) ?? null
  }, [environments, runEnvID])

  const overrideGPU = useMemo(() => {
    if (!catalog) return null
    if (override.gpu_type.trim()) {
      return catalog.gpus.find((g) => g.id === override.gpu_type.trim()) ?? null
    }
    if (!selectedRunEnv) return null
    return catalog.gpus.find((g) => g.id === selectedRunEnv.gpu_type) ?? null
  }, [catalog, override.gpu_type, selectedRunEnv])

  const overrideMaxGPUs = overrideGPU?.maxGpuCount || 8

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

  // ---- redirect if not authenticated ----
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/auth")
    }
  }, [authLoading, isAuthenticated, router])

  // ---- auto-select defaults when data arrives ----
  useEffect(() => {
    if (!envGPUType && catalog && catalog.gpus.length > 0) {
      setEnvGPUType(catalog.gpus[0].id)
    }
  }, [catalog, envGPUType])

  useEffect(() => {
    if (!runEnvID && environments.length > 0) {
      setRunEnvID(environments[0].environment_id)
    }
  }, [environments, runEnvID])

  useEffect(() => {
    if (frameworkVersions.length > 0 && !frameworkVersions.includes(frameworkVersion)) {
      setFrameworkVersion(frameworkVersions[0])
    }
  }, [frameworkVersions, frameworkVersion])

  useEffect(() => {
    if (Number.parseInt(envGPUCount, 10) > maxGPUs) {
      setEnvGPUCount(String(maxGPUs))
    }
  }, [envGPUCount, maxGPUs])

  // ---- action helpers ----
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

  async function launchRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await withBusy(async () => {
      await createRunMutation({
        environmentId: runEnvID as any,
        gpu_type: override.gpu_type.trim() || undefined,
        gpu_count: override.gpu_count.trim() ? Number.parseInt(override.gpu_count, 10) : undefined,
        volume_gb: override.volume_gb.trim() ? Number.parseInt(override.volume_gb, 10) : undefined,
      })
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
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-background">
        <div className="px-5 pt-6 pb-4">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/90 font-semibold">Tahuna</p>
          <p className="mt-1.5 text-sm text-foreground/60 truncate">{userEmail}</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {primaryNav.map((item) => {
            const Icon = item.icon
            const active = activeSection === item.id
            return (
              <Button
                key={item.id}
                variant="ghost"
                className={`w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${active ? "bg-primary/10 text-primary hover:bg-primary/10" : "text-foreground/70 hover:bg-secondary/60 hover:text-foreground"}`}
                onClick={() => setActiveSection(item.id)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Button>
            )
          })}
        </nav>

        <div className="border-t border-border px-3 py-3 space-y-0.5">
          <Button variant="ghost" asChild className="w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground/70 hover:bg-secondary/60 hover:text-foreground">
            <Link href="/api-key">
              <Key className="h-4 w-4 shrink-0" />
              API Key
            </Link>
          </Button>
          <Button
            variant="ghost"
            className={`w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${activeSection === "settings" ? "bg-primary/10 text-primary hover:bg-primary/10" : "text-foreground/70 hover:bg-secondary/60 hover:text-foreground"}`}
            onClick={() => setActiveSection("settings")}
          >
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 rounded-lg px-3 py-2.5 text-sm text-rose-300/80 hover:bg-rose-900/20 hover:text-rose-200"
            onClick={logout}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Logout
          </Button>
        </div>
      </aside>

      <main className="ml-60 min-h-screen">
        <div className="px-8 py-8 max-w-6xl">
          {error ? <p className="mb-6 rounded-md border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
          {message ? <p className="mb-6 rounded-md border border-primary/50 bg-primary/10 px-4 py-3 text-sm text-primary">{message}</p> : null}

          {activeSection === "data" ? (
            <section>
              <h2 className="text-2xl font-semibold tracking-tight mb-1">Data</h2>
              <p className="text-sm text-muted-foreground mb-8">Backend-backed storage references for environments and runs.</p>

              {dataRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">No data assets yet. Create an environment or run first.</p>
              ) : (
                <div className="overflow-x-auto border border-border rounded-lg bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Owner</th>
                        <th className="px-4 py-3">Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataRows.map((row) => (
                        <tr key={`${row.kind}-${row.owner}-${row.path}`} className="border-b last:border-b-0 border-border/40">
                          <td className="px-4 py-3 text-xs">{row.kind}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.owner}</td>
                          <td className="px-4 py-3 font-mono text-xs">{row.path}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {activeSection === "environments" ? (
            <section className="space-y-8">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-1">Environments</h2>
                <p className="text-sm text-muted-foreground">Create and manage your GPU-backed training environments.</p>
              </div>

              <form onSubmit={createEnvironment} className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="env-name">Name</Label>
                  <Input id="env-name" value={envName} onChange={(event) => setEnvName(event.target.value)} required />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="gpu-type">GPU</Label>
                    <select
                      id="gpu-type"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={envGPUType}
                      onChange={(event) => setEnvGPUType(event.target.value)}
                    >
                      {(catalog?.gpus || []).map((gpu) => (
                        <option key={gpu.id} value={gpu.id}>{gpu.displayName} ({gpu.id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="framework">Framework</Label>
                    <select
                      id="framework"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={framework}
                      onChange={(event) => setFramework(event.target.value)}
                    >
                      {Object.keys(catalog?.images || {}).map((key) => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="gpu-count">GPU Count</Label>
                    <Input
                      id="gpu-count"
                      type="number"
                      min={1}
                      max={maxGPUs}
                      value={envGPUCount}
                      onChange={(event) => setEnvGPUCount(event.target.value)}
                    />
                    {selectedGPU ? <p className="text-xs text-muted-foreground">Max for this GPU: {selectedGPU.maxGpuCount}</p> : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="volume">Volume (GB)</Label>
                    <Input id="volume" type="number" min={1} value={envVolume} onChange={(event) => setEnvVolume(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="version">Version</Label>
                    <select
                      id="version"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={frameworkVersion}
                      onChange={(event) => setFrameworkVersion(event.target.value)}
                    >
                      {frameworkVersions.map((version) => (
                        <option key={version} value={version}>{version}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Create environment"}</Button>
              </form>

              {environments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No environments yet.</p>
              ) : (
                <div className="overflow-x-auto border border-border rounded-lg bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Spec</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {environments.map((env) => (
                        <tr key={env.environment_id} className="border-b last:border-b-0 border-border/40">
                          <td className="px-4 py-3 font-mono text-xs">{env.environment_id}</td>
                          <td className="px-4 py-3">{env.name}</td>
                          <td className="px-4 py-3 text-xs text-foreground/80">{env.framework}:{env.version} | {env.gpu_type} x{env.gpu_count} | {env.volume_gb}GB</td>
                          <td className="px-4 py-3">
                            <Button variant="outline" size="sm" onClick={() => deleteEnvironment(env.environment_id)} disabled={busy}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {activeSection === "runs" ? (
            <section className="space-y-8">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight mb-1">Runs</h2>
                <p className="text-sm text-muted-foreground">Launch and monitor training runs.</p>
              </div>

              <form onSubmit={launchRun} className="rounded-xl border border-border bg-card p-6 space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="run-env">Environment</Label>
                    <select
                      id="run-env"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={runEnvID}
                      onChange={(event) => setRunEnvID(event.target.value)}
                    >
                      {environments.map((env) => (
                        <option key={env.environment_id} value={env.environment_id}>{env.name} ({env.environment_id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="override-gpu">Override GPU (optional)</Label>
                    <select
                      id="override-gpu"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={override.gpu_type}
                      onChange={(event) => setOverride((prev) => ({ ...prev, gpu_type: event.target.value }))}
                    >
                      <option value="">Use environment default</option>
                      {(catalog?.gpus || []).map((gpu) => (
                        <option key={gpu.id} value={gpu.id}>{gpu.displayName} ({gpu.id})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="override-count">Override GPU Count</Label>
                    <Input
                      id="override-count"
                      type="number"
                      min={1}
                      max={overrideMaxGPUs}
                      value={override.gpu_count}
                      onChange={(event) => setOverride((prev) => ({ ...prev, gpu_count: event.target.value }))}
                      placeholder="optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="override-volume">Override Volume (GB)</Label>
                    <Input
                      id="override-volume"
                      type="number"
                      min={1}
                      value={override.volume_gb}
                      onChange={(event) => setOverride((prev) => ({ ...prev, volume_gb: event.target.value }))}
                      placeholder="optional"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={busy || environments.length === 0}>{busy ? "Starting..." : "Start training"}</Button>
              </form>

              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                <div className="overflow-x-auto border border-border rounded-lg bg-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-4 py-3">Run</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Environment</th>
                        <th className="px-4 py-3">Effective Infra</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.run_id} className="border-b last:border-b-0 border-border/40 align-top">
                          <td className="px-4 py-3 font-mono text-xs">{run.run_id}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-md border px-2 py-1 text-xs ${statusTone(run.status)}`}>{run.status}</span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{run.env_id}</td>
                          <td className="px-4 py-3 text-xs text-foreground/80">{run.effective_gpu_type || "-"} / {run.effective_gpu_count || "-"} / {run.effective_volume_gb || "-"}GB</td>
                          <td className="px-4 py-3">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || !["queued", "provisioning", "running", "cancelling"].includes(run.status)}
                              onClick={() => cancelRun(run.run_id)}
                            >
                              Cancel
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {activeSection === "settings" ? (
            <section>
              <h2 className="text-2xl font-semibold tracking-tight mb-1">Settings</h2>
              <p className="text-sm text-muted-foreground">Account and dashboard controls.</p>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  )
}
