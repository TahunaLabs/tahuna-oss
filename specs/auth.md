# Spec: Authentication & Identity

## Scope

Single-user email OTP authentication with:

- CLI-initiated machine/session provisioning implemented with API keys under the hood
- authenticated Tahuna API access for user-facing serve inference requests through a Tahuna-owned proxy surface

No OAuth providers, no team/org accounts.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| User account | Backend record | Email-identified user created via Better Auth |
| Browser session | Credential | Better Auth web session for authenticated dashboard/API usage |
| API key | Credential | SHA256-hashed bearer token stored in `apiKeys` table |
| Machine/session | Backend projection | User-visible machine identity mapped to latest active key |
| Runtime token | Internal credential | Opaque bearer token used only by Tahuna-managed pods for runtime callbacks |
| Serve inference proxy | API surface | Tahuna-authenticated API route family rooted at `/api/serves/{serve_id}/inference[/...]` that proxies user inference traffic to a running serve |
| CLI config file | Local file | `~/.config/tahuna/config.env` stores `TAHUNA_API_KEY` |
| Browser auth page | Web page | `/auth/cli` — email OTP entry + callback redirect |

## Lifecycle

### Login Flow

```
CLI                          Browser                      Backend
 |                              |                            |
 |-- start local HTTP server -->|                            |
 |   (random port, /callback)  |                            |
 |                              |                            |
 |-- open browser ------------->|                            |
 |   /auth/cli?state=X         |                            |
 |   &callback=localhost:PORT   |                            |
 |                              |-- email OTP request ------>|
 |                              |<-- OTP sent to email ------|
 |                              |-- user enters OTP -------->|
 |                              |<-- OTP verified -----------|
 |                              |                            |
 |                              |-- generate API key ------->|
 |                              |   (name: cli-{timestamp})  |
 |                              |<-- plaintext key ----------|
 |                              |                            |
 |<-- redirect to callback -----|                            |
 |   /callback?state=X          |                            |
 |   &token=PLAINTEXT_KEY       |                            |
 |                              |                            |
 |-- validate state match       |                            |
 |-- save to config.env         |                            |
 |-- shutdown local server      |                            |
```

### API Key Rules

| Rule | Value |
|------|-------|
| Max active keys per user | Shared config: `AUTH_MAX_ACTIVE_KEYS` |
| Max keys per machine | 1 (new login on same machine revokes previous) |
| Key expiry | Shared config: `AUTH_KEY_TTL_DAYS` |
| Key format | Opaque random token, stored as SHA256 hash in DB |
| Revocation | Explicit via dashboard, or automatic on re-login from same machine |
| Key creation source | CLI `tahuna login` only (no dashboard key creation) |

- Dashboard exposes these as machine/session records with revoke controls (not raw key-first UX).

### Token Resolution Order (CLI)

1. `TAHUNA_API_KEY` environment variable
2. `~/.config/tahuna/config.env` file
3. If neither: error — prompt user to run `tahuna login`

### API Key Validation (Backend)

1. Extract `Authorization: Bearer <token>` header.
2. SHA256 hash the token.
3. Lookup `apiKeys` by `keyHash`.
4. Reject if: not found, revoked (`revokedAt` set), or expired (older than configured TTL).
5. Update `lastUsedAt` timestamp.
6. Return associated `userId`.

## Serve Inference Access

User-facing inference requests for a running serve must terminate at Tahuna API routes, not at raw provider URLs.

Canonical route family:

- `/api/serves/{serve_id}/inference`
- `/api/serves/{serve_id}/inference/...`

Rules:

- Tahuna-authenticated browser sessions may call serve inference routes.
- Tahuna API keys may call serve inference routes.
- direct provider endpoints such as public RunPod proxy URLs are implementation detail only and are not the canonical user-facing contract
- Tahuna owns the public inference edge as an app-agnostic transport and auth layer
- Tahuna must authorize the caller against the target serve before proxying the request
- Tahuna must not require an example-specific or OpenAI-specific inference payload schema at the auth boundary
- Tahuna may preserve the app-defined HTTP method, path, query string, headers, and body when proxying, subject to future public-surface rules
- the Python app behind the serve owns inference request and response semantics
- Tahuna must forward the authenticated request to the backing serve process on the internal serve port
- the Python app behind the serve is not responsible for validating Tahuna user sessions or API keys
- runtime tokens are internal-only and must never be accepted as user inference credentials

### Credential Boundary

There are two distinct auth surfaces:

1. User auth.
   Browser session or API key used by humans, CLI clients, and future SDKs to call Tahuna API.

2. Runtime auth.
   Opaque runtime bearer token used only by Tahuna-managed pods to call runtime callback endpoints such as bootstrap, status, logs, and metrics.

Runtime auth is not JWT-based user auth and must not be exposed as the public inference authentication model.

## Invariants

- API keys are never stored in plaintext on the backend.
- A user can have at most `AUTH_MAX_ACTIVE_KEYS` active (non-revoked, non-expired) API keys.
- The CLI never prompts for a password. Authentication is always browser-delegated.
- The local callback server binds to `127.0.0.1` only (no network exposure).
- The `state` parameter must match between the auth request and the callback to prevent CSRF.
- User-facing serve inference never depends on direct provider endpoint access.
- User-facing serve inference uses a Tahuna-owned proxy surface and is not tied to the current example app's payload shape or route layout.
- Runtime tokens are internal-only credentials and are never a substitute for user auth.

## Error States

| Condition | Behavior |
|-----------|----------|
| No API key configured | CLI prints: "Not authenticated. Run `tahuna login` first." |
| Expired key | Backend returns 401. CLI prints: "Session expired. Run `tahuna login` to re-authenticate." |
| Revoked key | Backend returns 401. Same message as expired. |
| Max keys already active | Oldest key is auto-revoked when new one is created. |
| Browser auth cancelled | CLI times out after configured login timeout, prints: "Login cancelled or timed out." |
| Callback state mismatch | CLI rejects token, prints: "Authentication failed. Please try again." |

## Dependencies

- Better Auth (email OTP provider)
- Convex `apiKeys` table
- `~/.config/tahuna/` directory (created on first login)

## Shared Defaults & Constants

- Auth key limits, token TTL, and login timeout values are defined in `web/config.ts`.
