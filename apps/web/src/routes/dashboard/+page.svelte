<script lang="ts">
  import { Alert } from '$lib/components/ui/alert';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card';
  import SegmentedToggle from '$lib/components/SegmentedToggle.svelte';
  import TerminalBlock from '$lib/components/TerminalBlock.svelte';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Select } from '$lib/components/ui/select';
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
  import { Textarea } from '$lib/components/ui/textarea';
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

  function handleVisibilityToggle(next: string) {
    if (next === 'personal' || next === 'shareable') visibility = next;
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
      <Card className="rounded-2xl border-border/80 bg-card/70 backdrop-blur-xl">
        <CardHeader>
          <p class="text-xs uppercase tracking-[0.2em] text-primary/90">Tahuna Lab Console</p>
          <div class="mt-2 flex flex-wrap items-center justify-between gap-4">
            <CardTitle className="font-serif text-4xl md:text-5xl tracking-tight">Frontier Training Dashboard</CardTitle>
            <div class="text-right text-sm text-foreground/75">
              <p>{me?.email}</p>
            </div>
          </div>
          <CardDescription className="mt-2 max-w-3xl text-sm md:text-base text-foreground/75">
            Manage environments, experiments, and training runs from one screen.
          </CardDescription>
        </CardHeader>
      </Card>

      {#if error}<Alert variant="destructive">{error}</Alert>{/if}
      {#if message}<Alert variant="success">{message}</Alert>{/if}

      <section class="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-card/75">
          <CardHeader className="pb-3">
            <CardDescription className="text-xs uppercase tracking-[0.14em]">Storage</CardDescription>
            <CardTitle className="text-2xl">Ready</CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-foreground/70">Training inputs and outputs are available.</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/75">
          <CardHeader className="pb-3">
            <CardDescription className="text-xs uppercase tracking-[0.14em]">Environments</CardDescription>
            <CardTitle className="text-2xl">{environments.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-foreground/70">Artifact snapshots + infra defaults.</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/75">
          <CardHeader className="pb-3">
            <CardDescription className="text-xs uppercase tracking-[0.14em]">Active Runs</CardDescription>
            <CardTitle className="text-2xl">{runs.filter((run) => ['queued', 'provisioning', 'running', 'cancelling'].includes(run.status)).length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-foreground/70">Realtime lifecycle visibility.</p>
          </CardContent>
        </Card>
      </section>

      <section class="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/80 bg-card/80">
          <CardHeader>
            <CardDescription className="text-xs uppercase tracking-[0.14em]">Environment</CardDescription>
            <CardTitle className="text-2xl">Environment Builder</CardTitle>
          </CardHeader>
          <CardContent>
            <form on:submit={createEnvironment} class="space-y-4">
              <div class="space-y-2">
                <Label for="env-name">Name</Label>
                <Input id="env-name" bind:value={envName} required />
              </div>

              <SegmentedToggle
                className="w-fit"
                value={visibility}
                on:change={(event) => handleVisibilityToggle(event.detail)}
                options={[{ value: 'personal', label: 'Personal' }, { value: 'shareable', label: 'Shareable' }]}
              />

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="space-y-2">
                  <Label for="gpu-type">GPU</Label>
                  <Select id="gpu-type" bind:value={envGPUType}>
                    {#each (catalog?.gpus || []) as gpu}<option value={gpu}>{gpu}</option>{/each}
                  </Select>
                </div>
                <div class="space-y-2">
                  <Label for="framework">Framework</Label>
                  <Select id="framework" bind:value={framework}>
                    {#each Object.keys(catalog?.images || {}) as key}<option value={key}>{key}</option>{/each}
                  </Select>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-3">
                <div class="space-y-2">
                  <Label for="gpu-count">GPU Count</Label>
                  <Input id="gpu-count" type="number" min="1" bind:value={envGPUCount} />
                </div>
                <div class="space-y-2">
                  <Label for="volume">Volume (GB)</Label>
                  <Input id="volume" type="number" min="1" bind:value={envVolume} />
                </div>
                <div class="space-y-2">
                  <Label for="version">Version</Label>
                  <Select id="version" bind:value={frameworkVersion}>
                    {#each frameworkVersions as version}<option value={version}>{version}</option>{/each}
                  </Select>
                </div>
              </div>

              <Button type="submit" className="w-full sm:w-auto" variant="secondary" disabled={busy}>{busy ? 'Saving...' : 'Create environment'}</Button>
            </form>
          </CardContent>
        </Card>

        <TerminalBlock title="Run Configuration" className="border-border/80 bg-card/80" contentClassName="space-y-4">
            <Textarea bind:value={yamlConfig} className="min-h-40 font-mono text-xs" />
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div class="space-y-2">
                <Label for="override-gpu">GPU</Label>
                <Input id="override-gpu" bind:value={override.gpu_type} placeholder="optional" />
              </div>
              <div class="space-y-2">
                <Label for="override-count">GPU Count</Label>
                <Input id="override-count" type="number" min="1" bind:value={override.gpu_count} placeholder="optional" />
              </div>
              <div class="space-y-2">
                <Label for="override-volume">Volume (GB)</Label>
                <Input id="override-volume" type="number" min="1" bind:value={override.volume_gb} placeholder="optional" />
              </div>
            </div>
        </TerminalBlock>
      </section>

      <section class="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/80 bg-card/80">
          <CardHeader>
            <CardDescription className="text-xs uppercase tracking-[0.14em]">Experiment Design</CardDescription>
            <CardTitle className="text-2xl">Create Experiment</CardTitle>
          </CardHeader>
          <CardContent>
            <form on:submit={createExperiment} class="space-y-4">
              <div class="space-y-2">
                <Label for="exp-name">Experiment Name</Label>
                <Input id="exp-name" bind:value={experimentName} required />
              </div>
              <div class="space-y-2">
                <Label for="exp-env">Environment</Label>
                <Select id="exp-env" bind:value={experimentEnvID}>
                  {#each environments as env}<option value={env.environment_id}>{env.name} ({env.environment_id})</option>{/each}
                </Select>
              </div>
              <Button type="submit" className="w-full sm:w-auto" variant="secondary" disabled={busy || environments.length === 0}>
                {busy ? 'Creating...' : 'Create experiment'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/80 bg-card/80">
          <CardHeader>
            <CardDescription className="text-xs uppercase tracking-[0.14em]">Training</CardDescription>
            <CardTitle className="text-2xl">Launch Run</CardTitle>
          </CardHeader>
          <CardContent>
            <form on:submit={launchRun} class="space-y-4">
              <div class="space-y-2">
                <Label for="run-exp">Experiment</Label>
                <Select id="run-exp" bind:value={runExperimentID}>
                  {#each experiments as exp}<option value={exp.experiment_id}>{exp.name} ({exp.experiment_id})</option>{/each}
                </Select>
              </div>
              <Button type="submit" className="w-full sm:w-auto" variant="secondary" disabled={busy || experiments.length === 0}>
                {busy ? 'Starting...' : 'Start training'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <TerminalBlock title="Training Monitor" className="border-border/80 bg-card/85">
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Runs</p>
          <Button variant="outline" on:click={() => withBusy(refreshData)} disabled={busy}>Refresh</Button>
        </div>
        <div class="-mx-5">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow className="border-border/80">
                <TableHead className="py-2 pr-3">Run</TableHead>
                <TableHead className="py-2 pr-3">Status</TableHead>
                <TableHead className="py-2 pr-3">Experiment</TableHead>
                <TableHead className="py-2 pr-3">Effective Infra</TableHead>
                <TableHead className="py-2">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each runs as run}
                <TableRow className="align-top">
                  <TableCell className="py-3 pr-3 font-mono text-xs">{run.run_id}</TableCell>
                  <TableCell className="py-3 pr-3">
                    <Badge variant="outline" className={statusTone(run.status)}>{run.status}</Badge>
                  </TableCell>
                  <TableCell className="py-3 pr-3 font-mono text-xs">{run.experiment_id}</TableCell>
                  <TableCell className="py-3 pr-3 text-xs text-foreground/80">
                    {run.effective_gpu_type || '-'} / {run.effective_gpu_count || '-'} / {run.effective_volume_gb || '-'}GB
                  </TableCell>
                  <TableCell className="py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !['queued', 'provisioning', 'running', 'cancelling'].includes(run.status)}
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
      </TerminalBlock>

      <Card className="rounded-2xl border-border/80 bg-card/70">
        <CardHeader>
          <CardTitle className="text-xl">Environments</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid gap-3 md:grid-cols-2">
            {#each environments as env}
              <Card className="border-border/60 bg-background/35">
                <CardContent className="p-4">
                  <p class="font-semibold">{env.name}</p>
                  <p class="mt-2 text-xs text-foreground/70">{env.framework}:{env.version} | {env.gpu_type} x{env.gpu_count} | {env.volume_gb}GB</p>
                </CardContent>
              </Card>
            {/each}
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
{/if}
