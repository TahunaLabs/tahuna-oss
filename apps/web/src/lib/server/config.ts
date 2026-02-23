const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';
const DEFAULT_COOKIE_NAME = 'tahuna_auth_token';
const DEFAULT_ISSUER = 'tahuna-web';
const DEFAULT_AUDIENCE = 'tahuna-api';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

export function backendURL(path: string): string {
  const base =
    process.env.BACKEND_URL?.trim() ||
    process.env.VITE_PUBLIC_TAHUNA_API_URL?.trim() ||
    DEFAULT_BACKEND_URL;
  return `${base.replace(/\/+$/, '')}${path}`;
}

export function cookieName(): string {
  return process.env.AUTH_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME;
}

export function jwtIssuer(): string {
  return process.env.JWT_ISSUER?.trim() || DEFAULT_ISSUER;
}

export function jwtAudience(): string {
  return process.env.JWT_AUDIENCE?.trim() || DEFAULT_AUDIENCE;
}

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim() || '';
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
}

export function jwtTTLSeconds(): number {
  const raw = process.env.JWT_TTL_SECONDS?.trim() || '';
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
}

export function cookieSecure(): boolean {
  const raw = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return process.env.NODE_ENV === 'production';
}
