<script lang="ts">
  import { Alert } from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Select } from "$lib/components/ui/select";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/components/ui/table";
  import type {
    Catalog,
    Environment,
    Experiment,
    MeResponse,
    Run,
  } from "$lib/types";
  import {
    Database,
    FlaskConical,
    Key,
    LogOut,
    Play,
    Server,
    Settings,
    Trash2,
  } from "lucide-svelte";
  import { onMount } from "svelte";

  type RunOverride = { gpu_type: string; gpu_count: string; volume_gb: string };
  type MainSection = "data" | "environments" | "experiments" | "runs";
  type UtilitySection = "settings";

  let me: MeResponse | null = null;
  let loading = true;
  let busy = false;
  let error = "";
  let message = "";

  let activeSection: MainSection | UtilitySection = "environments";

  let catalog: Catalog | null = null;
  let environments: Environment[] = [];
  let experiments: Experiment[] = [];
  let runs: Run[] = [];

  let envName = "Frontier Runtime";
  let envGPUType = "";
  let envGPUCount = "1";
  let envVolume = "120";
  let framework = "pt";
  let frameworkVersion = "";

  let experimentName = "baseline";
  let experimentEnvID = "";

  let runExperimentID = "";
  let override: RunOverride = { gpu_type: "", gpu_count: "", volume_gb: "" };

  const primaryNav: {
    id: MainSection;
    label: string;
    icon: typeof Database;
  }[] = [
    { id: "data", label: "Data", icon: Database },
    { id: "environments", label: "Environments", icon: Server },
    { id: "experiments", label: "Experiments", icon: FlaskConical },
    { id: "runs", label: "Runs", icon: Play },
  ];

  $: frameworkVersions = catalog
    ? Object.keys(catalog.images[framework] || {})
    : [];
  $: if (
    frameworkVersions.length > 0 &&
    !frameworkVersions.includes(frameworkVersion)
  ) {
    frameworkVersion = frameworkVersions[0];
  }
  $: if (!experimentEnvID && environments.length > 0) {
    experimentEnvID = environments[0].environment_id;
  }
  $: if (!runExperimentID && experiments.length > 0) {
    runExperimentID = experiments[0].experiment_id;
  }

  $: dataRows = [
    ...environments.map((env) => ({
      kind: "Environment artifacts",
      owner: env.environment_id,
      path: env.artifacts,
    })),
    ...experiments.map((exp) => ({
      kind: "Experiment input",
      owner: exp.experiment_id,
      path: exp.input,
    })),
    ...runs.flatMap((run) => [
      { kind: "Run output", owner: run.run_id, path: run.output },
      { kind: "Run logs", owner: run.run_id, path: run.logs },
    ]),
  ];

  function statusTone(status: string): string {
    if (status === "running" || status === "provisioning")
      return "text-emerald-300 border-emerald-600/50 bg-emerald-900/20";
    if (status === "queued" || status === "cancelling")
      return "text-amber-200 border-amber-500/40 bg-amber-900/20";
    if (status === "succeeded" || status === "completed")
      return "text-cyan-200 border-cyan-500/40 bg-cyan-900/20";
    if (status === "failed" || status === "cancelled")
      return "text-rose-200 border-rose-500/40 bg-rose-900/20";
    return "text-foreground/90 border-border bg-card/80";
  }

  async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(url, init);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.detail || "request failed");
    return data as T;
  }

  async function refreshData() {
    const [catalogData, envData, expData, runData] = await Promise.all([
      fetchJSON<Catalog>("/api/dashboard/catalog"),
      fetchJSON<{ environments: Environment[] }>("/api/dashboard/environments"),
      fetchJSON<{ experiments: Experiment[] }>("/api/dashboard/experiments"),
      fetchJSON<{ runs: Run[] }>("/api/dashboard/runs"),
    ]);

    catalog = catalogData;
    environments = envData.environments;
    experiments = expData.experiments;
    runs = runData.runs;

    if (!envGPUType && catalogData.gpus.length > 0)
      envGPUType = catalogData.gpus[0];
  }

  async function withBusy(task: () => Promise<void>) {
    busy = true;
    error = "";
    message = "";
    try {
      await task();
    } catch (err) {
      error = err instanceof Error ? err.message : "unexpected error";
    } finally {
      busy = false;
    }
  }

  async function createEnvironment(event: SubmitEvent) {
    event.preventDefault();
    await withBusy(async () => {
      await fetchJSON<Environment>("/api/dashboard/environments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: envName,
          gpu_type: envGPUType,
          gpu_count: Number.parseInt(envGPUCount, 10),
          volume_gb: Number.parseInt(envVolume, 10),
          framework,
          version: frameworkVersion,
        }),
      });
      await refreshData();
      message = "Environment created.";
    });
  }

  async function deleteEnvironment(envID: string) {
    await withBusy(async () => {
      await fetchJSON(
        `/api/dashboard/environments?env_id=${encodeURIComponent(envID)}`,
        { method: "DELETE" },
      );
      await refreshData();
      message = `Environment ${envID} deleted.`;
    });
  }

  async function createExperiment(event: SubmitEvent) {
    event.preventDefault();
    await withBusy(async () => {
      await fetchJSON<Experiment>("/api/dashboard/experiments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ env_id: experimentEnvID, name: experimentName }),
      });
      await refreshData();
      message = "Experiment created.";
    });
  }

  async function deleteExperiment(expID: string) {
    await withBusy(async () => {
      await fetchJSON(
        `/api/dashboard/experiments?exp_id=${encodeURIComponent(expID)}`,
        { method: "DELETE" },
      );
      await refreshData();
      message = `Experiment ${expID} deleted.`;
    });
  }

  async function launchRun(event: SubmitEvent) {
    event.preventDefault();
    await withBusy(async () => {
      const payload: Record<string, string | number> = {
        experiment_id: runExperimentID,
      };
      if (override.gpu_type.trim()) payload.gpu_type = override.gpu_type.trim();
      if (override.gpu_count.trim())
        payload.gpu_count = Number.parseInt(override.gpu_count, 10);
      if (override.volume_gb.trim())
        payload.volume_gb = Number.parseInt(override.volume_gb, 10);

      await fetchJSON<Run>("/api/dashboard/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      await refreshData();
      message = "Run launched.";
    });
  }

  async function cancelRun(runID: string) {
    await withBusy(async () => {
      await fetchJSON(
        `/api/dashboard/runs?run_id=${encodeURIComponent(runID)}`,
        { method: "DELETE" },
      );
      await refreshData();
      message = `Run ${runID} cancellation requested.`;
    });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/auth";
  }

  onMount(async () => {
    try {
      const meResp = await fetch("/api/auth/me");
      if (meResp.status === 401) {
        window.location.href = "/auth";
        return;
      }
      if (!meResp.ok) throw new Error("failed to load session");
      me = (await meResp.json()) as MeResponse;
      await refreshData();
    } catch (err) {
      error = err instanceof Error ? err.message : "unexpected error";
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head><title>Dashboard | Tahuna</title></svelte:head>

{#if loading}
  <div
    class="min-h-screen flex items-center justify-center text-sm text-foreground/70"
  >
    Loading dashboard…
  </div>
{:else}
  <div class="min-h-screen text-foreground bg-background">
    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-background"
    >
      <div class="px-5 pt-6 pb-4">
        <p
          class="text-xs uppercase tracking-[0.2em] text-primary/90 font-semibold"
        >
          Tahuna
        </p>
        <p class="mt-1.5 text-sm text-foreground/60 truncate">{me?.email}</p>
      </div>

      <nav class="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {#each primaryNav as item}
          <button
            type="button"
            class={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${activeSection === item.id ? "bg-primary/10 text-primary" : "text-foreground/70 hover:bg-secondary/60 hover:text-foreground"}`}
            on:click={() => (activeSection = item.id)}
          >
            <svelte:component this={item.icon} class="h-4 w-4 shrink-0" />
            {item.label}
          </button>
        {/each}
      </nav>

      <div class="border-t border-border px-3 py-3 space-y-0.5">
        <a
          href="/api-key"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground/70 hover:bg-secondary/60 hover:text-foreground transition-colors"
        >
          <Key class="h-4 w-4 shrink-0" />
          API Key
        </a>
        <button
          type="button"
          class={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${activeSection === "settings" ? "bg-primary/10 text-primary" : "text-foreground/70 hover:bg-secondary/60 hover:text-foreground"}`}
          on:click={() => (activeSection = "settings")}
        >
          <Settings class="h-4 w-4 shrink-0" />
          Settings
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-rose-300/80 hover:bg-rose-900/20 hover:text-rose-200 transition-colors"
          on:click={logout}
        >
          <LogOut class="h-4 w-4 shrink-0" />
          Logout
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="ml-60 min-h-screen">
      <div class="px-8 py-8 max-w-6xl">
        {#if error}<Alert variant="destructive" className="mb-6">{error}</Alert
          >{/if}
        {#if message}<Alert variant="success" className="mb-6">{message}</Alert
          >{/if}

        <!-- DATA SECTION -->
        {#if activeSection === "data"}
          <section>
            <h2 class="text-2xl font-semibold tracking-tight mb-1">Data</h2>
            <p class="text-sm text-muted-foreground mb-8">
              Backend-backed storage references for environments, experiments,
              and runs.
            </p>

            {#if dataRows.length === 0}
              <p class="text-sm text-muted-foreground py-12 text-center">
                No data assets yet. Create an environment, experiment, or run
                first.
              </p>
            {:else}
              <div class="overflow-x-auto border border-border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead>Type</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Path</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {#each dataRows as row}
                      <TableRow>
                        <TableCell className="text-xs">{row.kind}</TableCell>
                        <TableCell className="font-mono text-xs"
                          >{row.owner}</TableCell
                        >
                        <TableCell className="font-mono text-xs"
                          >{row.path}</TableCell
                        >
                      </TableRow>
                    {/each}
                  </TableBody>
                </Table>
              </div>
            {/if}
          </section>
        {/if}

        <!-- ENVIRONMENTS SECTION -->
        {#if activeSection === "environments"}
          <section>
            <div class="flex items-center justify-between mb-8">
              <div>
                <h2 class="text-2xl font-semibold tracking-tight mb-1">
                  Environments
                </h2>
                <p class="text-sm text-muted-foreground">
                  GPU environments for training your models.
                </p>
              </div>
            </div>

            <!-- Create form -->
            <div class="border-b border-border pb-8 mb-8">
              <h3
                class="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-5"
              >
                Create Environment
              </h3>
              <form
                on:submit={createEnvironment}
                class="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end"
              >
                <div class="space-y-2">
                  <Label for="env-name">Name</Label>
                  <Input id="env-name" bind:value={envName} required />
                </div>
                <div class="space-y-2">
                  <Label for="gpu-type">GPU</Label>
                  <Select id="gpu-type" bind:value={envGPUType}>
                    {#each catalog?.gpus || [] as gpu}<option value={gpu}
                        >{gpu}</option
                      >{/each}
                  </Select>
                </div>
                <div class="space-y-2">
                  <Label for="framework">Framework</Label>
                  <Select id="framework" bind:value={framework}>
                    {#each Object.keys(catalog?.images || {}) as key}<option
                        value={key}>{key}</option
                      >{/each}
                  </Select>
                </div>
                <div class="grid grid-cols-3 gap-2">
                  <div class="space-y-2">
                    <Label for="version">Ver</Label>
                    <Select id="version" bind:value={frameworkVersion}>
                      {#each frameworkVersions as version}<option
                          value={version}>{version}</option
                        >{/each}
                    </Select>
                  </div>
                  <div class="space-y-2">
                    <Label for="gpu-count">GPUs</Label>
                    <Input
                      id="gpu-count"
                      type="number"
                      min="1"
                      bind:value={envGPUCount}
                    />
                  </div>
                  <div class="space-y-2">
                    <Label for="volume">Vol (GB)</Label>
                    <Input
                      id="volume"
                      type="number"
                      min="1"
                      bind:value={envVolume}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={busy}
                  className="h-10">{busy ? "Saving…" : "Create"}</Button
                >
              </form>
            </div>

            <!-- Environment list -->
            {#if environments.length === 0}
              <p class="text-sm text-muted-foreground py-12 text-center">
                No environments yet.
              </p>
            {:else}
              <div class="overflow-x-auto border border-border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead>Name</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Framework</TableHead>
                      <TableHead>GPU</TableHead>
                      <TableHead>Volume</TableHead>
                      <TableHead>Artifacts</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {#each environments as env}
                      <TableRow>
                        <TableCell className="font-medium">{env.name}</TableCell
                        >
                        <TableCell className="font-mono text-xs"
                          >{env.environment_id}</TableCell
                        >
                        <TableCell className="text-xs"
                          >{env.framework}:{env.version}</TableCell
                        >
                        <TableCell className="text-xs"
                          >{env.gpu_type} ×{env.gpu_count}</TableCell
                        >
                        <TableCell className="text-xs"
                          >{env.volume_gb} GB</TableCell
                        >
                        <TableCell
                          className="font-mono text-xs text-foreground/60"
                          >{env.artifacts}</TableCell
                        >
                        <TableCell>
                          <button
                            class="p-1.5 rounded-md text-foreground/40 hover:text-rose-300 hover:bg-rose-900/20 transition-colors disabled:opacity-30"
                            disabled={busy}
                            on:click={() =>
                              deleteEnvironment(env.environment_id)}
                            title="Delete environment"
                          >
                            <Trash2 class="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    {/each}
                  </TableBody>
                </Table>
              </div>
            {/if}
          </section>
        {/if}

        <!-- EXPERIMENTS SECTION -->
        {#if activeSection === "experiments"}
          <section>
            <div class="flex items-center justify-between mb-8">
              <div>
                <h2 class="text-2xl font-semibold tracking-tight mb-1">
                  Experiments
                </h2>
                <p class="text-sm text-muted-foreground">
                  Training experiments linked to your environments.
                </p>
              </div>
            </div>

            <!-- Create form -->
            <div class="border-b border-border pb-8 mb-8">
              <h3
                class="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-5"
              >
                Create Experiment
              </h3>
              <form
                on:submit={createExperiment}
                class="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end"
              >
                <div class="space-y-2">
                  <Label for="exp-name">Experiment Name</Label>
                  <Input id="exp-name" bind:value={experimentName} required />
                </div>
                <div class="space-y-2">
                  <Label for="exp-env">Environment</Label>
                  <Select id="exp-env" bind:value={experimentEnvID}>
                    {#each environments as env}<option
                        value={env.environment_id}
                        >{env.name} ({env.environment_id})</option
                      >{/each}
                  </Select>
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={busy || environments.length === 0}
                  className="h-10"
                >
                  {busy ? "Creating…" : "Create"}
                </Button>
              </form>
            </div>

            <!-- Experiment list -->
            {#if experiments.length === 0}
              <p class="text-sm text-muted-foreground py-12 text-center">
                No experiments yet.
              </p>
            {:else}
              <div class="overflow-x-auto border border-border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead>Name</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Environment</TableHead>
                      <TableHead>Input Path</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {#each experiments as exp}
                      <TableRow>
                        <TableCell className="font-medium">{exp.name}</TableCell
                        >
                        <TableCell className="font-mono text-xs"
                          >{exp.experiment_id}</TableCell
                        >
                        <TableCell className="font-mono text-xs"
                          >{exp.env_id}</TableCell
                        >
                        <TableCell className="font-mono text-xs"
                          >{exp.input}</TableCell
                        >
                        <TableCell>
                          <button
                            class="p-1.5 rounded-md text-foreground/40 hover:text-rose-300 hover:bg-rose-900/20 transition-colors disabled:opacity-30"
                            disabled={busy}
                            on:click={() => deleteExperiment(exp.experiment_id)}
                            title="Delete experiment"
                          >
                            <Trash2 class="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    {/each}
                  </TableBody>
                </Table>
              </div>
            {/if}
          </section>
        {/if}

        <!-- RUNS SECTION -->
        {#if activeSection === "runs"}
          <section>
            <div class="flex items-center justify-between mb-8">
              <div>
                <h2 class="text-2xl font-semibold tracking-tight mb-1">Runs</h2>
                <p class="text-sm text-muted-foreground">
                  Launch and monitor training runs.
                </p>
              </div>
              <Button
                variant="outline"
                on:click={() => withBusy(refreshData)}
                disabled={busy}
                size="sm">Refresh</Button
              >
            </div>

            <!-- Launch form -->
            <div class="border-b border-border pb-8 mb-8">
              <h3
                class="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-5"
              >
                Launch Run
              </h3>
              <form
                on:submit={launchRun}
                class="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end"
              >
                <div class="space-y-2">
                  <Label for="run-exp">Experiment</Label>
                  <Select id="run-exp" bind:value={runExperimentID}>
                    {#each experiments as exp}<option value={exp.experiment_id}
                        >{exp.name} ({exp.experiment_id})</option
                      >{/each}
                  </Select>
                </div>
                <div class="space-y-2">
                  <Label for="override-gpu">GPU Override</Label>
                  <Input
                    id="override-gpu"
                    bind:value={override.gpu_type}
                    placeholder="optional"
                  />
                </div>
                <div class="space-y-2">
                  <Label for="override-count">GPUs</Label>
                  <Input
                    id="override-count"
                    type="number"
                    min="1"
                    bind:value={override.gpu_count}
                    placeholder="—"
                  />
                </div>
                <div class="space-y-2">
                  <Label for="override-volume">Vol</Label>
                  <Input
                    id="override-volume"
                    type="number"
                    min="1"
                    bind:value={override.volume_gb}
                    placeholder="—"
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={busy || experiments.length === 0}
                  className="h-10"
                >
                  {busy ? "Starting…" : "Start run"}
                </Button>
              </form>
            </div>

            <!-- Run list -->
            {#if runs.length === 0}
              <p class="text-sm text-muted-foreground py-12 text-center">
                No runs yet.
              </p>
            {:else}
              <div class="overflow-x-auto border border-border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead>Run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Experiment</TableHead>
                      <TableHead>Effective Infra</TableHead>
                      <TableHead className="w-20">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {#each runs as run}
                      <TableRow className="align-top">
                        <TableCell className="font-mono text-xs"
                          >{run.run_id}</TableCell
                        >
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusTone(run.status)}
                            >{run.status}</Badge
                          >
                        </TableCell>
                        <TableCell className="font-mono text-xs"
                          >{run.experiment_id}</TableCell
                        >
                        <TableCell className="text-xs text-foreground/80">
                          {run.effective_gpu_type || "—"} / {run.effective_gpu_count ||
                            "—"} / {run.effective_volume_gb || "—"}GB
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy ||
                              ![
                                "queued",
                                "provisioning",
                                "running",
                                "cancelling",
                              ].includes(run.status)}
                            on:click={() => cancelRun(run.run_id)}
                          >
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    {/each}
                  </TableBody>
                </Table>
              </div>
            {/if}
          </section>
        {/if}

        <!-- SETTINGS SECTION -->
        {#if activeSection === "settings"}
          <section>
            <h2 class="text-2xl font-semibold tracking-tight mb-1">Settings</h2>
            <p class="text-sm text-muted-foreground mb-8">
              Account and dashboard controls.
            </p>

            <div class="space-y-6 max-w-lg">
              <div class="border-b border-border pb-4">
                <p
                  class="text-xs uppercase tracking-widest text-muted-foreground mb-1"
                >
                  Email
                </p>
                <p class="font-medium">{me?.email}</p>
              </div>
              <div class="border-b border-border pb-4">
                <p
                  class="text-xs uppercase tracking-widest text-muted-foreground mb-1"
                >
                  User ID
                </p>
                <p class="font-mono text-sm">{me?.user_id}</p>
              </div>
              <div class="flex flex-wrap gap-3 pt-2">
                <a href="/api-key"
                  ><Button variant="secondary">Manage API Key</Button></a
                >
                <Button
                  variant="outline"
                  on:click={() => withBusy(refreshData)}
                  disabled={busy}>Sync from backend</Button
                >
              </div>
            </div>
          </section>
        {/if}
      </div>
    </main>
  </div>
{/if}
