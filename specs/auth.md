# Spec: Authentication & Identity

## Scope

Single-user email OTP authentication with CLI-initiated machine/session provisioning (implemented with API keys under the hood). No OAuth providers, no team/org accounts.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| User account | Backend record | Email-identified user created via Better Auth |
| API key | Credential | SHA256-hashed bearer token stored in `apiKeys` table |
| Machine/session | Backend projection | User-visible machine identity mapped to latest active key |
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

## Invariants

- API keys are never stored in plaintext on the backend.
- A user can have at most `AUTH_MAX_ACTIVE_KEYS` active (non-revoked, non-expired) API keys.
- The CLI never prompts for a password. Authentication is always browser-delegated.
- The local callback server binds to `127.0.0.1` only (no network exposure).
- The `state` parameter must match between the auth request and the callback to prevent CSRF.

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
