export const waitlistPlatforms = ["web", "ios", "android"] as const

export type WaitlistPlatform = (typeof waitlistPlatforms)[number]

interface WaitlistSubmission {
  email: string
  platforms: WaitlistPlatform[]
  turnstileToken: string
}

interface TurnstileResult {
  action?: unknown
  hostname?: unknown
  success?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseWaitlistSubmission(value: unknown): WaitlistSubmission | null {
  if (!isRecord(value)) return null
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : ""
  const platforms = Array.isArray(value.platforms)
    ? [...new Set(value.platforms.filter(isWaitlistPlatform))]
    : []
  const turnstileToken = typeof value.turnstileToken === "string" ? value.turnstileToken.trim() : ""

  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return null
  if (platforms.length === 0 || !turnstileToken || turnstileToken.length > 2048) return null
  return { email, platforms, turnstileToken }
}

export function isValidTurnstileResult(
  result: TurnstileResult,
  expectedHostnames: ReadonlySet<string>,
) {
  return (
    result.success === true &&
    result.action === "join_waitlist" &&
    typeof result.hostname === "string" &&
    expectedHostnames.has(result.hostname)
  )
}

function isWaitlistPlatform(value: unknown): value is WaitlistPlatform {
  return typeof value === "string" && waitlistPlatforms.includes(value as WaitlistPlatform)
}
