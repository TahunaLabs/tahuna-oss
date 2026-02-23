<script lang="ts">
  import { goto } from '$app/navigation';
  import AuthPageShell from '$lib/components/AuthPageShell.svelte';
  import { Alert } from '$lib/components/ui/alert';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

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
      <Label for="email">Email</Label>
      <Input
        id="email"
        type="email"
        autocomplete="email"
        required
        placeholder="you@example.com"
        bind:value={email}
      />
    </div>

    <Button type="submit" disabled={busy || needsVerification} className="w-full sm:w-auto" variant="secondary">
      {busy ? 'Sending code...' : 'Send verification code'}
    </Button>

    {#if error}<Alert variant="destructive">{error}</Alert>{/if}

    {#if needsVerification}
      <Alert variant="success" className="mt-4 space-y-3">
        <p class="text-sm text-foreground">Enter the 6-digit code sent to your email.</p>
        {#if emailSent}
          <p class="text-xs text-muted-foreground">Verification code sent to <span class="font-medium">{email}</span>.</p>
        {:else}
          <p class="text-xs text-amber-200">We could not confirm email delivery for <span class="font-medium">{email}</span>.{warning ? ` ${warning}` : ''}</p>
        {/if}

        <div class="space-y-3">
          <div class="space-y-2">
            <Label for="otp">Verification Code</Label>
            <Input
              id="otp"
              required
              inputmode="numeric"
              pattern="[0-9]{6}"
              maxlength="6"
              placeholder="123456"
              bind:value={otp}
            />
          </div>
          <Button type="button" on:click={onVerifyCode} disabled={busy || otp.trim().length !== 6} className="w-full sm:w-auto" variant="secondary">
            {busy ? 'Verifying...' : 'Verify and continue'}
          </Button>
        </div>
      </Alert>
    {/if}
  </form>
</AuthPageShell>
