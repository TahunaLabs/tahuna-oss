"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type MeResponse = {
  user_id: string
  email: string
  role: string
  org_id: string
}

type Environment = {
  environment_id: string
  name: string
  artifacts: string
  gpu_type: string
  gpu_count: number
  volume_gb: number
  framework: string
  version: string
}

type Experiment = {
  experiment_id: string
  name: string
  env_id: string
  input: string
}

type Run = {
  run_id: string
  env_id: string
  experiment_id: string
  input: string
  output: string
  logs: string
  status: string
  error?: string
  effective_gpu_type?: string
  effective_gpu_count?: number
  effective_volume_gb?: number
  cancellation_requested?: boolean
}

type Catalog = {
  gpus: string[]
  images: Record<string, Record<string, string>>
}

type RunOverride = {
  gpu_type: string
  gpu_count: string
  volume_gb: string
}

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
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [runs, setRuns] = useState<Run[]>([])

  const [envName, setEnvName] = useState("Frontier Runtime")
  const [envGPUType, setEnvGPUType] = useState("")
  const [envGPUCount, setEnvGPUCount] = useState("1")
  const [envVolume, setEnvVolume] = useState("120")
  const [framework, setFramework] = useState("pt")
  const [frameworkVersion, setFrameworkVersion] = useState("")
  const [visibility, setVisibility] = useState<"personal" | "shareable">("personal")

  const [experimentName, setExperimentName] = useState("baseline")
  const [experimentEnvID, setExperimentEnvID] = useState("")

  const [runExperimentID, setRunExperimentID] = useState("")
  const [override, setOverride] = useState<RunOverride>(defaultOverride)
  const [yamlConfig, setYamlConfig] = useState(`train:\n  entrypoint: train.py\n  function: train_fn\ninfra:\n  retries: 2\n  checkpoint: true\n`)

  const frameworkVersions = useMemo(() => {
    if (!catalog) return []
    return Object.keys(catalog.images[framework] || {})
  }, [catalog, framework])

  async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(url, init)
    const data = await resp.json()
    if (!resp.ok) {
      throw new Error(data?.detail || "request failed")
    }
    return data as T
  }

  async function refreshData() {
    const [catalogData, envData, expData, runData] = await Promise.all([
      fetchJSON<Catalog>("/api/dashboard/catalog"),
      fetchJSON<{ environments: Environment[] }>("/api/dashboard/environments"),
      fetchJSON<{ experiments: Experiment[] }>("/api/dashboard/experiments"),
      fetchJSON<{ runs: Run[] }>("/api/dashboard/runs"),
    ])

    setCatalog(catalogData)
    setEnvironments(envData.environments)
    setExperiments(expData.experiments)
    setRuns(runData.runs)

    if (!envGPUType && catalogData.gpus.length > 0) {
      setEnvGPUType(catalogData.gpus[0])
    }
    const versions = Object.keys(catalogData.images[framework] || {})
    if (!frameworkVersion && versions.length > 0) {
      setFrameworkVersion(versions[0])
    }
    if (!experimentEnvID && envData.environments.length > 0) {
      setExperimentEnvID(envData.environments[0].environment_id)
    }
    if (!runExperimentID && expData.experiments.length > 0) {
      setRunExperimentID(expData.experiments[0].experiment_id)
    }
  }

  useEffect(() => {
    let active = true

    async function bootstrap() {
      try {
        const meResp = await fetch("/api/auth/me")
        if (meResp.status === 401) {
          router.replace("/auth")
          return
        }
        if (!meResp.ok) {
          throw new Error("failed to load session")
        }
        const meData = (await meResp.json()) as MeResponse
        if (!active) return

        setMe(meData)
        await refreshData()
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "unexpected error")
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    bootstrap()
    return () => {
      active = false
    }
  }, [router])

  useEffect(() => {
    if (frameworkVersions.length > 0 && !frameworkVersions.includes(frameworkVersion)) {
      setFrameworkVersion(frameworkVersions[0])
    }
  }, [frameworkVersions, frameworkVersion])

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
      await fetchJSON<Environment>("/api/dashboard/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: envName,
          gpu_type: envGPUType,
          gpu_count: Number.parseInt(envGPUCount, 10),
          volume_gb: Number.parseInt(envVolume, 10),
          framework,
          version: frameworkVersion,
        }),
      })
      await refreshData()
      setMessage(`Environment created (${visibility} mode).`)
    })
  }

  async function createExperiment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await withBusy(async () => {
      await fetchJSON<Experiment>("/api/dashboard/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          env_id: experimentEnvID,
          name: experimentName,
        }),
      })
      await refreshData()
      setMessage("Experiment created.")
    })
  }

  async function launchRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await withBusy(async () => {
      const payload: Record<string, string | number> = {
        experiment_id: runExperimentID,
      }
      if (override.gpu_type.trim()) payload.gpu_type = override.gpu_type.trim()
      if (override.gpu_count.trim()) payload.gpu_count = Number.parseInt(override.gpu_count.trim(), 10)
      if (override.volume_gb.trim()) payload.volume_gb = Number.parseInt(override.volume_gb.trim(), 10)

      await fetchJSON<Run>("/api/dashboard/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      await refreshData()
      setMessage("Run launched.")
    })
  }

  async function cancelRun(runID: string) {
    await withBusy(async () => {
      await fetchJSON<{ run_id: string }>(`/api/dashboard/runs?run_id=${encodeURIComponent(runID)}`, {
        method: "DELETE",
      })
      await refreshData()
      setMessage(`Run ${runID} cancellation requested.`)
    })
  }

  if (loading) {
    return <div className="min-h-screen p-8 text-sm text-foreground/70">Loading dashboard...</div>
  }

  return (
    <div className="min-h-screen text-foreground bg-[radial-gradient(circle_at_15%_20%,rgba(200,168,78,0.18),transparent_38%),radial-gradient(circle_at_88%_0%,rgba(71,179,171,0.12),transparent_30%),rgba(9,24,25,0.95)]">
      <div className="mx-auto max-w-7xl px-6 py-10 md:py-14 space-y-8">
        <header className="rounded-2xl border border-border/80 bg-card/70 backdrop-blur-xl p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-primary/90">Tahuna Lab Console</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <h1 className="font-serif text-4xl md:text-5xl tracking-tight">Frontier Training Dashboard</h1>
            <div className="text-right text-sm text-foreground/75">
              <p>{me?.email}</p>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm md:text-base text-foreground/75">
            Manage environments, experiments, and training runs from one screen.
          </p>
        </header>

        {error ? <p className="rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">{error}</p> : null}
        {message ? <p className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-3 text-sm text-primary">{message}</p> : null}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-card/75 p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Storage</p>
            <p className="mt-2 text-2xl font-semibold">Ready</p>
            <p className="mt-2 text-sm text-foreground/70">Training inputs and outputs are available.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/75 p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Environments</p>
            <p className="mt-2 text-2xl font-semibold">{environments.length}</p>
            <p className="mt-2 text-sm text-foreground/70">Artifact snapshots + infra defaults.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card/75 p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Active Runs</p>
            <p className="mt-2 text-2xl font-semibold">{runs.filter((run) => ["queued", "provisioning", "running", "cancelling"].includes(run.status)).length}</p>
            <p className="mt-2 text-sm text-foreground/70">Realtime lifecycle visibility.</p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={createEnvironment} className="rounded-2xl border border-border/80 bg-card/80 p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Environment</p>
              <h2 className="mt-1 text-2xl font-semibold">Environment Builder</h2>
            </div>

            <div className="space-y-2">
              <Label htmlFor="env-name">Name</Label>
              <Input id="env-name" value={envName} onChange={(event) => setEnvName(event.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVisibility("personal")}
                className={`rounded-lg border px-3 py-2 text-sm ${visibility === "personal" ? "border-primary bg-primary/15" : "border-border bg-background/40"}`}
              >
                Personal
              </button>
              <button
                type="button"
                onClick={() => setVisibility("shareable")}
                className={`rounded-lg border px-3 py-2 text-sm ${visibility === "shareable" ? "border-primary bg-primary/15" : "border-border bg-background/40"}`}
              >
                Shareable
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="gpu-type">GPU</Label>
                <select
                  id="gpu-type"
                  className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm"
                  value={envGPUType}
                  onChange={(event) => setEnvGPUType(event.target.value)}
                >
                  {(catalog?.gpus || []).map((gpu) => (
                    <option key={gpu} value={gpu}>{gpu}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="framework">Framework</Label>
                <select
                  id="framework"
                  className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm"
                  value={framework}
                  onChange={(event) => setFramework(event.target.value)}
                >
                  {Object.keys(catalog?.images || {}).map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="gpu-count">GPU Count</Label>
                <Input id="gpu-count" type="number" min={1} value={envGPUCount} onChange={(event) => setEnvGPUCount(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="volume">Volume (GB)</Label>
                <Input id="volume" type="number" min={1} value={envVolume} onChange={(event) => setEnvVolume(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <select
                  id="version"
                  className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm"
                  value={frameworkVersion}
                  onChange={(event) => setFrameworkVersion(event.target.value)}
                >
                  {frameworkVersions.map((version) => (
                    <option key={version} value={version}>{version}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button type="submit" disabled={busy} className="w-full sm:w-auto">
              {busy ? "Saving..." : "Create environment"}
            </Button>
          </form>

          <div className="rounded-2xl border border-border/80 bg-card/80 p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Configuration</p>
              <h2 className="mt-1 text-2xl font-semibold">Run Configuration</h2>
            </div>
            <Textarea
              value={yamlConfig}
              onChange={(event) => setYamlConfig(event.target.value)}
              className="min-h-40 font-mono text-xs"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="override-gpu">GPU</Label>
                <Input
                  id="override-gpu"
                  value={override.gpu_type}
                  onChange={(event) => setOverride((prev) => ({ ...prev, gpu_type: event.target.value }))}
                  placeholder="optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-count">GPU Count</Label>
                <Input
                  id="override-count"
                  type="number"
                  min={1}
                  value={override.gpu_count}
                  onChange={(event) => setOverride((prev) => ({ ...prev, gpu_count: event.target.value }))}
                  placeholder="optional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-volume">Volume (GB)</Label>
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
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <form onSubmit={createExperiment} className="rounded-2xl border border-border/80 bg-card/80 p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Experiment Design</p>
              <h2 className="mt-1 text-2xl font-semibold">Create Experiment</h2>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-name">Experiment Name</Label>
              <Input id="exp-name" value={experimentName} onChange={(event) => setExperimentName(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-env">Environment</Label>
              <select
                id="exp-env"
                className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm"
                value={experimentEnvID}
                onChange={(event) => setExperimentEnvID(event.target.value)}
              >
                {environments.map((env) => (
                  <option key={env.environment_id} value={env.environment_id}>{env.name} ({env.environment_id})</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy || environments.length === 0} className="w-full sm:w-auto">
              {busy ? "Creating..." : "Create experiment"}
            </Button>
          </form>

          <form onSubmit={launchRun} className="rounded-2xl border border-border/80 bg-card/80 p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Training</p>
              <h2 className="mt-1 text-2xl font-semibold">Launch Run</h2>
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-exp">Experiment</Label>
              <select
                id="run-exp"
                className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm"
                value={runExperimentID}
                onChange={(event) => setRunExperimentID(event.target.value)}
              >
                {experiments.map((exp) => (
                  <option key={exp.experiment_id} value={exp.experiment_id}>{exp.name} ({exp.experiment_id})</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy || experiments.length === 0} className="w-full sm:w-auto">
              {busy ? "Starting..." : "Start training"}
            </Button>
          </form>
        </section>

        <section className="rounded-2xl border border-border/80 bg-card/85 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Runs</p>
              <h2 className="mt-1 text-2xl font-semibold">Training Monitor</h2>
            </div>
            <Button variant="outline" onClick={() => withBusy(refreshData)} disabled={busy}>
              Refresh
            </Button>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border/80 text-left text-muted-foreground">
                  <th className="py-2 pr-3">Run</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Experiment</th>
                  <th className="py-2 pr-3">Effective Infra</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.run_id} className="border-b border-border/40 align-top">
                    <td className="py-3 pr-3 font-mono text-xs">{run.run_id}</td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-xs ${statusTone(run.status)}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs">{run.experiment_id}</td>
                    <td className="py-3 pr-3 text-xs text-foreground/80">
                      {run.effective_gpu_type || "-"} / {run.effective_gpu_count || "-"} / {run.effective_volume_gb || "-"}GB
                    </td>
                    <td className="py-3">
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
        </section>

        <section className="rounded-2xl border border-border/80 bg-card/70 p-6">
          <h2 className="text-xl font-semibold">Environments</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {environments.map((env) => (
              <div key={env.environment_id} className="rounded-lg border border-border/60 bg-background/35 p-4">
                <p className="font-semibold">{env.name}</p>
                <p className="mt-2 text-xs text-foreground/70">{env.framework}:{env.version} | {env.gpu_type} x{env.gpu_count} | {env.volume_gb}GB</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
