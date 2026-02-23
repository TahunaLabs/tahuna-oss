<script lang="ts">
  import { onMount } from 'svelte';
  import AuthPageShell from '$lib/components/AuthPageShell.svelte';

  type MeResponse = { user_id: string; email: string; role: string; org_id: string };
  type BootstrapResponse = { user_id: string; api_key: string; api_key_id: string };

  const defaultURL =
    (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.VITE_PUBLIC_TAHUNA_API_URL?.trim()) ||
    'http://localhost:8000';

  let email = '';
  let name = 'cli';
  let loadingProfile = true;
  let busy = false;
  let error = '';
  let result: BootstrapResponse | null = null;

  $: exportSnippet = result ? `export TAHUNA_API_URL=${defaultURL}\nexport TAHUNA_API_KEY=${result.api_key}` : '';

  onMount(async () => {
    try {
      const resp = await fetch('/api/auth/me');
      if (!resp.ok) return;
      const me = (await resp.json()) as MeResponse;
      email = me.email || '';
    } finally {
      loadingProfile = false;
    }
  });

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    result = null;

    try {
      const resp = await fetch('/api/auth/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'failed to create api key');
      result = data as BootstrapResponse;
    } catch (err) {
      error = err instanceof Error ? err.message : 'unexpected error';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>API Key | Tahuna</title></svelte:head>

<AuthPageShell
  eyebrow="CLI Credentials"
  title="Get an API key"
  subtitle="Issue an API key for local CLI usage. You must be signed in. Keys are displayed once, so copy them when generated."
>
  <form on:submit={onSubmit} class="space-y-5">
    <div class="space-y-2">
      <label for="email">Signed In As</label>
      <input id="email" class="w-full rounded-md border border-input bg-background/60 px-3 py-2" type="email" placeholder="Sign in first" value={email} readonly disabled />
    </div>

    <div class="space-y-2">
      <label for="name">Key Name</label>
      <input id="name" class="w-full rounded-md border border-input bg-background/60 px-3 py-2" required placeholder="cli" bind:value={name} />
    </div>

    <button type="submit" disabled={busy || loadingProfile} class="w-full sm:w-auto rounded-md border border-primary/50 bg-primary/15 px-4 py-2 text-sm">
      {busy ? 'Creating key...' : 'Create API key'}
    </button>

    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

    {#if result}
      <div class="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-3">
        <p class="text-sm">Key ID: <span class="font-mono">{result.api_key_id}</span></p>
        <div class="rounded-md border border-border bg-background/70 p-3 font-mono text-xs break-all">{result.api_key}</div>
        <pre class="rounded-md border border-border bg-background/70 p-3 text-xs overflow-x-auto"><code>{exportSnippet}</code></pre>
      </div>
    {/if}
  </form>
</AuthPageShell>
