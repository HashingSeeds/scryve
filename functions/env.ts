export interface PagesEnv {
  APP_ORIGIN?: string
  CLERK_PUBLISHABLE_KEY?: string
  CLERK_SECRET_KEY?: string
  CONVEX_SITE_URL?: string
  TURNSTILE_SECRET_KEY?: string
  WAITLIST_GATE_ENABLED?: string
  WAITLIST_INGEST_SECRET?: string
}

export function requireEnv(env: PagesEnv, key: keyof PagesEnv) {
  const value = env[key]
  if (!value) throw new Error(`${key} is not configured`)
  return value
}
