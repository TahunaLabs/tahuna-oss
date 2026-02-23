<script lang="ts">
  import { goto } from '$app/navigation';

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
      const data = (await resp.json()) as { detail?: string; email_sent?: boolean; warning?: string };
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

<main class="container" style="padding:48px 0;">
  <section class="card" style="max-width:700px;margin:0 auto;padding:30px;">
    <p class="muted" style="letter-spacing:.14em;text-transform:uppercase;font-size:12px;">Account Access</p>
    <h1 style="margin:8px 0 6px;">Sign in or sign up</h1>
    <p class="muted" style="margin-top:0;">Use your email and a one-time verification code.</p>

    <form on:submit={onRequestCode} style="display:grid;gap:12px;margin-top:18px;">
      <label>
        <div style="font-size:14px;margin-bottom:6px;">Email</div>
        <input class="input" type="email" bind:value={email} required placeholder="you@example.com" />
      </label>

      <div>
        <button class="primary" type="submit" disabled={busy || needsVerification}>
          {busy ? 'Sending code...' : 'Send verification code'}
        </button>
      </div>

      {#if error}
        <p style="color:#ffb3a8;margin:2px 0 0;">{error}</p>
      {/if}
    </form>

    {#if needsVerification}
      <div class="card" style="margin-top:16px;padding:16px;background:rgba(200,168,78,.08);">
        <p style="margin:0 0 8px;">Enter the 6-digit code sent to your email.</p>
        {#if emailSent}
          <p class="muted" style="margin-top:0;font-size:13px;">Verification code sent to <strong>{email}</strong>.</p>
        {:else}
          <p style="margin-top:0;font-size:13px;color:#f0c76a;">We could not confirm delivery for <strong>{email}</strong>. {warning}</p>
        {/if}

        <label>
          <div style="font-size:14px;margin-bottom:6px;">Verification Code</div>
          <input class="input" bind:value={otp} inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="123456" />
        </label>
        <div style="margin-top:10px;">
          <button class="primary" type="button" on:click={onVerifyCode} disabled={busy || otp.trim().length !== 6}>
            {busy ? 'Verifying...' : 'Verify and continue'}
          </button>
        </div>
      </div>
    {/if}
  </section>
</main>
