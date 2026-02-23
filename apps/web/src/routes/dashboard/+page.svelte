<script lang="ts">
  import type { Catalog, Environment, Experiment, MeResponse, Run } from '$lib/types';
  import { onMount } from 'svelte';

  type RunOverride = { gpu_type: string; gpu_count: string; volume_gb: string };

  let me: MeResponse | null = null;
  let loading = true;
  let busy = false;
  let error = '';
  let message = '';

  let catalog: Catalog | null = null;
  let environments: Environment[] = [];
  let experiments: Experiment[] = [];
  let runs: Run[] = [];

  let envName = 'Frontier Runtime';
  let envGPUType = '';
  let envGPUCount = '1';
  let envVolume = '120';
  let framework = 'pt';
  let frameworkVersion = '';
  let visibility: 'personal' | 'shareable' = 'personal';

  let experimentName = 'baseline';
  let experimentEnvID = '';

  let runExperimentID = '';
  let override: RunOverride = { gpu_type: '', gpu_count: '', volume_gb: '' };
  let yamlConfig = `train:\n  entrypoint: train.py\n  function: train_fn\ninfra:\n  retries: 2\n  checkpoint: true\n`;

  $: frameworkVersions = catalog ? Object.keys(catalog.images[framework] || {}) : [];

  function statusTone(status: string): string {
    if (status === 'running' || status === 'provisioning') return 'text-emerald-300 border-emerald-600/50 bg-emerald-900/20';
    if (status === 'queued' || status === 'cancelling') return 'text-amber-200 border-amber-500/40 bg-amber-900/20';
    if (status === 'succeeded' || status === 'completed') return 'text-cyan-200 border-cyan-500/40 bg-cyan-900/20';
    if (status === 'failed' || status === 'cancelled') return 'text-rose-200 border-rose-500/40 bg-rose-900/20';
    return 'text-foreground/90 border-border bg-card/80';
  }

  async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const resp = await fetch(url, init);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.detail || 'request failed');
    return data as T;
  }

  async function refreshData() {
    const [catalogData, envData, expData, runData] = await Promise.all([
      fetchJSON<Catalog>('/api/dashboard/catalog'),
      fetchJSON<{ environments: Environment[] }>('/api/dashboard/environments'),
      fetchJSON<{ experiments: Experiment[] }>('/api/dashboard/experiments'),
      fetchJSON<{ runs: Run[] }>('/api/dashboard/runs')
    ]);

    catalog = catalogData;
    environments = envData.environments;
    experiments = expData.experiments;
    runs = runData.runs;

    if (!envGPUType && catalogData.gpus.length > 0) envGPUType = catalogData.gpus[0];
    const versions = Object.keys(catalogData.images[framework] || {});
    if (!frameworkVersion && versions.length > 0) frameworkVersion = versions[0];
    if (!experimentEnvID && envData.environments.length > 0) experimentEnvID = envData.environments[0].environment_id;
    if (!runExperimentID && expData.experiments.length > 0) runExperimentID = expData.experiments[0].experiment_id;
  }

  async function withBusy(task: () => Promise<void>) {
    busy = true;
    error = '';
    message = '';
    try {
      await task();
    } catch (err) {
      error = err instanceof Error ? err.message : 'unexpected error';
    } finally {
      busy = false;
    }
  }

  async function createEnvironment(event: SubmitEvent) {
    event.preventDefault();
    await withBusy(async () => {
      await fetchJSON<Environment>('/api/dashboard/environments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: envName,
          gpu_type: envGPUType,
          gpu_count: Number.parseInt(envGPUCount, 10),
          volume_gb: Number.parseInt(envVolume, 10),
          framework,
          version: frameworkVersion
        })
      });
      await refreshData();
      message = `Environment created (${visibility} mode).`;
    });
  }

  async function createExperiment(event: SubmitEvent) {
    event.preventDefault();
    await withBusy(async () => {
      await fetchJSON<Experiment>('/api/dashboard/experiments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ env_id: experimentEnvID, name: experimentName })
      });
      await refreshData();
      message = 'Experiment created.';
    });
  }

  async function launchRun(event: SubmitEvent) {
    event.preventDefault();
    await withBusy(async () => {
      const payload: Record<string, string | number> = { experiment_id: runExperimentID };
      if (override.gpu_type.trim()) payload.gpu_type = override.gpu_type.trim();
      if (override.gpu_count.trim()) payload.gpu_count = Number.parseInt(override.gpu_count, 10);
      if (override.volume_gb.trim()) payload.volume_gb = Number.parseInt(override.volume_gb, 10);

      await fetchJSON<Run>('/api/dashboard/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await refreshData();
      message = 'Run launched.';
    });
  }

  async function cancelRun(runID: string) {
    await withBusy(async () => {
      await fetchJSON(`/api/dashboard/runs?run_id=${encodeURIComponent(runID)}`, { method: 'DELETE' });
      await refreshData();
      message = `Run ${runID} cancellation requested.`;
    });
  }

  onMount(async () => {
    try {
      const meResp = await fetch('/api/auth/me');
      if (meResp.status === 401) {
        window.location.href = '/auth';
        return;
      }
      if (!meResp.ok) throw new Error('failed to load session');
      me = (await meResp.json()) as MeResponse;
      await refreshData();
    } catch (err) {
      error = err instanceof Error ? err.message : 'unexpected error';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head><title>Dashboard | Tahuna</title></svelte:head>

{#if loading}
  <div class="min-h-screen p-8 text-sm text-foreground/70">Loading dashboard...</div>
{:else}
  <div class="min-h-screen text-foreground bg-[radial-gradient(circle_at_15%_20%,rgba(200,168,78,0.18),transparent_38%),radial-gradient(circle_at_88%_0%,rgba(71,179,171,0.12),transparent_30%),rgba(9,24,25,0.95)]">
    <div class="mx-auto max-w-7xl px-6 py-10 md:py-14 space-y-8">
      <header class="rounded-2xl border border-border/80 bg-card/70 backdrop-blur-xl p-6 md:p-8">
        <p class="text-xs uppercase tracking-[0.2em] text-primary/90">Tahuna Lab Console</p>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-4">
          <h1 class="font-serif text-4xl md:text-5xl tracking-tight">Frontier Training Dashboard</h1>
          <div class="text-right text-sm text-foreground/75">
            <p>{me?.email}</p>
          </div>
        </div>
        <p class="mt-4 max-w-3xl text-sm md:text-base text-foreground/75">Manage environments, experiments, and training runs from one screen.</p>
      </header>

      {#if error}<p class="rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">{error}</p>{/if}
      {#if message}<p class="rounded-lg border border-primary/50 bg-primary/10 px-4 py-3 text-sm text-primary">{message}</p>{/if}

      <section class="grid gap-4 md:grid-cols-3">
        <div class="rounded-xl border border-border/70 bg-card/75 p-5">
          <p class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Storage</p>
          <p class="mt-2 text-2xl font-semibold">Ready</p>
          <p class="mt-2 text-sm text-foreground/70">Training inputs and outputs are available.</p>
        </div>
        <div class="rounded-xl border border-border/70 bg-card/75 p-5">
          <p class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Environments</p>
          <p class="mt-2 text-2xl font-semibold">{environments.length}</p>
          <p class="mt-2 text-sm text-foreground/70">Artifact snapshots + infra defaults.</p>
        </div>
        <div class="rounded-xl border border-border/70 bg-card/75 p-5">
          <p class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Active Runs</p>
          <p class="mt-2 text-2xl font-semibold">{runs.filter((run) => ['queued', 'provisioning', 'running', 'cancelling'].includes(run.status)).length}</p>
          <p class="mt-2 text-sm text-foreground/70">Realtime lifecycle visibility.</p>
        </div>
      </section>

      <section class="grid gap-6 lg:grid-cols-2">
        <form on:submit={createEnvironment} class="rounded-2xl border border-border/80 bg-card/80 p-6 space-y-4">
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Environment</p>
            <h2 class="mt-1 text-2xl font-semibold">Environment Builder</h2>
          </div>

          <div class="space-y-2">
            <label for="env-name">Name</label>
            <input id="env-name" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" bind:value={envName} required />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <button type="button" on:click={() => (visibility = 'personal')} class={`rounded-lg border px-3 py-2 text-sm ${visibility === 'personal' ? 'border-primary bg-primary/15' : 'border-border bg-background/40'}`}>Personal</button>
            <button type="button" on:click={() => (visibility = 'shareable')} class={`rounded-lg border px-3 py-2 text-sm ${visibility === 'shareable' ? 'border-primary bg-primary/15' : 'border-border bg-background/40'}`}>Shareable</button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="space-y-2">
              <label for="gpu-type">GPU</label>
              <select id="gpu-type" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" bind:value={envGPUType}>
                {#each (catalog?.gpus || []) as gpu}<option value={gpu}>{gpu}</option>{/each}
              </select>
            </div>
            <div class="space-y-2">
              <label for="framework">Framework</label>
              <select id="framework" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" bind:value={framework}>
                {#each Object.keys(catalog?.images || {}) as key}<option value={key}>{key}</option>{/each}
              </select>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div class="space-y-2">
              <label for="gpu-count">GPU Count</label>
              <input id="gpu-count" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" type="number" min="1" bind:value={envGPUCount} />
            </div>
            <div class="space-y-2">
              <label for="volume">Volume (GB)</label>
              <input id="volume" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" type="number" min="1" bind:value={envVolume} />
            </div>
            <div class="space-y-2">
              <label for="version">Version</label>
              <select id="version" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" bind:value={frameworkVersion}>
                {#each frameworkVersions as version}<option value={version}>{version}</option>{/each}
              </select>
            </div>
          </div>

          <button type="submit" class="w-full sm:w-auto rounded-md border border-primary/50 bg-primary/15 px-4 py-2 text-sm" disabled={busy}>{busy ? 'Saving...' : 'Create environment'}</button>
        </form>

        <div class="rounded-2xl border border-border/80 bg-card/80 p-6 space-y-4">
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Configuration</p>
            <h2 class="mt-1 text-2xl font-semibold">Run Configuration</h2>
          </div>
          <textarea bind:value={yamlConfig} class="min-h-40 w-full rounded-md border border-input bg-background/60 px-3 py-2 font-mono text-xs"></textarea>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div class="space-y-2">
              <label for="override-gpu">GPU</label>
              <input id="override-gpu" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" bind:value={override.gpu_type} placeholder="optional" />
            </div>
            <div class="space-y-2">
              <label for="override-count">GPU Count</label>
              <input id="override-count" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" type="number" min="1" bind:value={override.gpu_count} placeholder="optional" />
            </div>
            <div class="space-y-2">
              <label for="override-volume">Volume (GB)</label>
              <input id="override-volume" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" type="number" min="1" bind:value={override.volume_gb} placeholder="optional" />
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-6 lg:grid-cols-2">
        <form on:submit={createExperiment} class="rounded-2xl border border-border/80 bg-card/80 p-6 space-y-4">
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Experiment Design</p>
            <h2 class="mt-1 text-2xl font-semibold">Create Experiment</h2>
          </div>
          <div class="space-y-2">
            <label for="exp-name">Experiment Name</label>
            <input id="exp-name" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" bind:value={experimentName} required />
          </div>
          <div class="space-y-2">
            <label for="exp-env">Environment</label>
            <select id="exp-env" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" bind:value={experimentEnvID}>
              {#each environments as env}<option value={env.environment_id}>{env.name} ({env.environment_id})</option>{/each}
            </select>
          </div>
          <button type="submit" class="w-full sm:w-auto rounded-md border border-primary/50 bg-primary/15 px-4 py-2 text-sm" disabled={busy || environments.length === 0}>{busy ? 'Creating...' : 'Create experiment'}</button>
        </form>

        <form on:submit={launchRun} class="rounded-2xl border border-border/80 bg-card/80 p-6 space-y-4">
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Training</p>
            <h2 class="mt-1 text-2xl font-semibold">Launch Run</h2>
          </div>
          <div class="space-y-2">
            <label for="run-exp">Experiment</label>
            <select id="run-exp" class="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm" bind:value={runExperimentID}>
              {#each experiments as exp}<option value={exp.experiment_id}>{exp.name} ({exp.experiment_id})</option>{/each}
            </select>
          </div>
          <button type="submit" class="w-full sm:w-auto rounded-md border border-primary/50 bg-primary/15 px-4 py-2 text-sm" disabled={busy || experiments.length === 0}>{busy ? 'Starting...' : 'Start training'}</button>
        </form>
      </section>

      <section class="rounded-2xl border border-border/80 bg-card/85 p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Runs</p>
            <h2 class="mt-1 text-2xl font-semibold">Training Monitor</h2>
          </div>
          <button class="rounded-md border border-border px-4 py-2 text-sm" on:click={() => withBusy(refreshData)} disabled={busy}>Refresh</button>
        </div>

        <div class="mt-5 overflow-x-auto">
          <table class="w-full min-w-[900px] text-sm">
            <thead>
              <tr class="border-b border-border/80 text-left text-muted-foreground">
                <th class="py-2 pr-3">Run</th>
                <th class="py-2 pr-3">Status</th>
                <th class="py-2 pr-3">Experiment</th>
                <th class="py-2 pr-3">Effective Infra</th>
                <th class="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {#each runs as run}
                <tr class="border-b border-border/40 align-top">
                  <td class="py-3 pr-3 font-mono text-xs">{run.run_id}</td>
                  <td class="py-3 pr-3"><span class={`inline-flex rounded-md border px-2 py-1 text-xs ${statusTone(run.status)}`}>{run.status}</span></td>
                  <td class="py-3 pr-3 font-mono text-xs">{run.experiment_id}</td>
                  <td class="py-3 pr-3 text-xs text-foreground/80">{run.effective_gpu_type || '-'} / {run.effective_gpu_count || '-'} / {run.effective_volume_gb || '-'}GB</td>
                  <td class="py-3"><button class="rounded-md border border-border px-3 py-1.5 text-xs" disabled={busy || !['queued', 'provisioning', 'running', 'cancelling'].includes(run.status)} on:click={() => cancelRun(run.run_id)}>Cancel</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <section class="rounded-2xl border border-border/80 bg-card/70 p-6">
        <h2 class="text-xl font-semibold">Environments</h2>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          {#each environments as env}
            <div class="rounded-lg border border-border/60 bg-background/35 p-4">
              <p class="font-semibold">{env.name}</p>
              <p class="mt-2 text-xs text-foreground/70">{env.framework}:{env.version} | {env.gpu_type} x{env.gpu_count} | {env.volume_gb}GB</p>
            </div>
          {/each}
        </div>
      </section>
    </div>
  </div>
{/if}
