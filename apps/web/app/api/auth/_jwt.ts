import { createHmac } from "node:crypto"

const DEFAULT_COOKIE_NAME = "tahuna_auth_token"
const DEFAULT_ISSUER = "tahuna-web"
const DEFAULT_AUDIENCE = "tahuna-api"
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7

type JWTConfig = {
  secret: string
  issuer: string
  audience: string
  ttlSeconds: number
  cookieName: string
  cookieSecure: boolean
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

function loadConfig(): JWTConfig {
  const secret = process.env.JWT_SECRET?.trim() || ""
  if (!secret) {
    throw new Error("JWT_SECRET is required")
  }

  const ttlRaw = process.env.JWT_TTL_SECONDS?.trim() || ""
  const parsedTTL = Number.parseInt(ttlRaw, 10)
  const ttlSeconds = Number.isFinite(parsedTTL) && parsedTTL > 0 ? parsedTTL : DEFAULT_TTL_SECONDS

  const cookieSecureEnv = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase()
  const cookieSecure =
    cookieSecureEnv === "true" ? true : cookieSecureEnv === "false" ? false : process.env.NODE_ENV === "production"

  return {
    secret,
    issuer: process.env.JWT_ISSUER?.trim() || DEFAULT_ISSUER,
    audience: process.env.JWT_AUDIENCE?.trim() || DEFAULT_AUDIENCE,
    ttlSeconds,
    cookieName: process.env.AUTH_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME,
    cookieSecure,
  }
}

export function issueJWT(userID: string): { token: string; cookieName: string; maxAge: number; secure: boolean } {
  const cfg = loadConfig()
  const now = Math.floor(Date.now() / 1000)

  const header = {
    alg: "HS256",
    typ: "JWT",
  }

  const payload = {
    sub: userID,
    iss: cfg.issuer,
    aud: cfg.audience,
    iat: now,
    exp: now + cfg.ttlSeconds,
  }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = createHmac("sha256", cfg.secret).update(signingInput).digest("base64url")

  return {
    token: `${signingInput}.${signature}`,
    cookieName: cfg.cookieName,
    maxAge: cfg.ttlSeconds,
    secure: cfg.cookieSecure,
  }
}

export function readJWTFromCookieHeader(req: Request): string {
  const cookieName = process.env.AUTH_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME
  const cookieHeader = req.headers.get("cookie") ?? ""
  if (!cookieHeader) {
    return ""
  }

  const parts = cookieHeader.split(";")
  for (const part of parts) {
    const [rawName, ...rawValue] = part.trim().split("=")
    if (rawName === cookieName) {
      return decodeURIComponent(rawValue.join("="))
    }
  }
  return ""
}
