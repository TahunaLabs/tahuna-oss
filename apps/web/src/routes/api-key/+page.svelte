<script lang="ts">
  import { onMount } from 'svelte';

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

  $: exportSnippet = result
    ? `export TAHUNA_API_URL=${defaultURL}\nexport TAHUNA_API_KEY=${result.api_key}`
    : '';

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

<main class="container" style="padding:48px 0;">
  <section class="card" style="max-width:760px;margin:0 auto;padding:30px;">
    <p class="muted" style="letter-spacing:.14em;text-transform:uppercase;font-size:12px;">CLI Credentials</p>
    <h1 style="margin:8px 0 6px;">Get an API key</h1>
    <p class="muted" style="margin-top:0;">Issue a key for local CLI usage. Keys are shown once.</p>

    <form on:submit={onSubmit} style="display:grid;gap:12px;margin-top:16px;">
      <label>
        <div style="font-size:14px;margin-bottom:6px;">Signed In As</div>
        <input class="input" type="email" value={email} disabled />
      </label>

      <label>
        <div style="font-size:14px;margin-bottom:6px;">Key Name</div>
        <input class="input" bind:value={name} required placeholder="cli" />
      </label>

      <div>
        <button class="primary" disabled={busy || loadingProfile}>
          {busy ? 'Creating key...' : 'Create API key'}
        </button>
      </div>

      {#if error}
        <p style="color:#ffb3a8;margin:2px 0 0;">{error}</p>
      {/if}

      {#if result}
        <div class="card" style="padding:14px;background:rgba(200,168,78,.08);display:grid;gap:10px;">
          <p style="margin:0;">Key ID: <code>{result.api_key_id}</code></p>
          <div class="card" style="padding:10px;font-family:ui-monospace,monospace;font-size:12px;word-break:break-all;">{result.api_key}</div>
          <pre class="card" style="padding:10px;font-size:12px;overflow:auto;"><code>{exportSnippet}</code></pre>
        </div>
      {/if}
    </form>
  </section>
</main>
