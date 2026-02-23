<script lang="ts">
  import { onMount } from 'svelte';
  import AuthPageShell from '$lib/components/AuthPageShell.svelte';
  import { Alert } from '$lib/components/ui/alert';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

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
      <Label for="email">Signed In As</Label>
      <Input id="email" type="email" placeholder="Sign in first" value={email} readonly disabled />
    </div>

    <div class="space-y-2">
      <Label for="name">Key Name</Label>
      <Input id="name" required placeholder="cli" bind:value={name} />
    </div>

    <Button type="submit" disabled={busy || loadingProfile} className="w-full sm:w-auto" variant="secondary">
      {busy ? 'Creating key...' : 'Create API key'}
    </Button>

    {#if error}<Alert variant="destructive">{error}</Alert>{/if}

    {#if result}
      <Alert variant="success" className="mt-4 space-y-3">
        <p class="text-sm">Key ID: <span class="font-mono">{result.api_key_id}</span></p>
        <div class="rounded-md border border-border bg-background/70 p-3 font-mono text-xs break-all">{result.api_key}</div>
        <pre class="rounded-md border border-border bg-background/70 p-3 text-xs overflow-x-auto"><code>{exportSnippet}</code></pre>
      </Alert>
    {/if}
  </form>
</AuthPageShell>
