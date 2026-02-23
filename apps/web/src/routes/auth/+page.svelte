<script lang="ts">
  import { goto } from '$app/navigation';
  import AuthPageShell from '$lib/components/AuthPageShell.svelte';

  let email = '';
  let otp = '';
  let busy = false;
  let error = '';
  let needsVerification = false;
  let emailSent: boolean | null = null;
  let warning = '';

  async function onRequestCode(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    needsVerification = false;
    emailSent = null;
    warning = '';
    otp = '';

    try {
      const resp = await fetch('/api/auth/request-email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = (await resp.json()) as { detail?: string; email_sent?: boolean; warning?: string | null };
      if (!resp.ok) throw new Error(data.detail || 'failed to request verification code');
      emailSent = Boolean(data.email_sent);
      warning = data.warning || '';
      needsVerification = true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'unexpected error';
    } finally {
      busy = false;
    }
  }

  async function onVerifyCode() {
    busy = true;
    error = '';
    try {
      const resp = await fetch('/api/auth/verify-email-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });
      const data = (await resp.json()) as { detail?: string };
      if (!resp.ok) throw new Error(data.detail || 'failed to verify code');
      await goto('/dashboard', { replaceState: true });
    } catch (err) {
      error = err instanceof Error ? err.message : 'unexpected error';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Sign In | Tahuna</title></svelte:head>

<AuthPageShell
  eyebrow="Account Access"
  title="Sign in or sign up"
  subtitle="Use your email and a one-time verification code. New and returning users use the same flow."
>
  <form on:submit={onRequestCode} class="space-y-5">
    <div class="space-y-2">
      <label for="email">Email</label>
      <input
        id="email"
        class="w-full rounded-md border border-input bg-background/60 px-3 py-2"
        type="email"
        autocomplete="email"
        required
        placeholder="you@example.com"
        bind:value={email}
      />
    </div>

    <button type="submit" disabled={busy || needsVerification} class="w-full sm:w-auto rounded-md border border-primary/50 bg-primary/15 px-4 py-2 text-sm">
      {busy ? 'Sending code...' : 'Send verification code'}
    </button>

    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

    {#if needsVerification}
      <div class="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-3">
        <p class="text-sm text-foreground">Enter the 6-digit code sent to your email.</p>
        {#if emailSent}
          <p class="text-xs text-muted-foreground">Verification code sent to <span class="font-medium">{email}</span>.</p>
        {:else}
          <p class="text-xs text-amber-200">We could not confirm email delivery for <span class="font-medium">{email}</span>.{warning ? ` ${warning}` : ''}</p>
        {/if}

        <div class="space-y-3">
          <div class="space-y-2">
            <label for="otp">Verification Code</label>
            <input
              id="otp"
              class="w-full rounded-md border border-input bg-background/60 px-3 py-2"
              required
              inputmode="numeric"
              pattern="[0-9]{6}"
              maxlength="6"
              placeholder="123456"
              bind:value={otp}
            />
          </div>
          <button type="button" on:click={onVerifyCode} disabled={busy || otp.trim().length !== 6} class="w-full sm:w-auto rounded-md border border-primary/50 bg-primary/15 px-4 py-2 text-sm">
            {busy ? 'Verifying...' : 'Verify and continue'}
          </button>
        </div>
      </div>
    {/if}
  </form>
</AuthPageShell>
