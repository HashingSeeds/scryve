export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
export const INVITE_LIFETIME_MS = 24 * 60 * 60 * 1000
export const MAX_MANUAL_CODE_CANDIDATES = 8
export const MAX_RULESET_LENGTH = 32
export const MAX_AVATAR_URL_LENGTH = 512
export const MEMBERSHIP_MIGRATION_VERSION = 1
export const STALE_GAME_INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000
export const STALE_GAME_CLEANUP_BATCH_SIZE = 25

export function assertPlayerCount(count: number) {
  if (!Number.isInteger(count) || count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new Error("A connected lobby must have 2–6 seats")
  }
}

export function assertStartingLife(life: number) {
  if (!Number.isInteger(life) || life < 1 || life > 999)
    throw new Error("Starting life must be 1–999")
}

export function assertInviteToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token))
    throw new Error("Invite token must contain at least 256 bits of URL-safe entropy")
}

export function assertRuleset(ruleset: string) {
  const value = ruleset.trim()
  if (value.length < 1 || value.length > MAX_RULESET_LENGTH)
    throw new Error(`Ruleset must be 1–${MAX_RULESET_LENGTH} characters`)
  return value
}

export function assertManualCodeCandidates(candidates: string[]) {
  if (candidates.length < 1 || candidates.length > MAX_MANUAL_CODE_CANDIDATES)
    throw new Error(`Provide 1–${MAX_MANUAL_CODE_CANDIDATES} manual code candidates`)
  for (const candidate of candidates) {
    if (candidate.length < 6 || candidate.length > 16)
      throw new Error("Manual code candidates must be 6–16 characters")
  }
}

export function normalizeManualCode(code: string) {
  const normalized = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
  if (!/^[A-Z0-9]{6}$/.test(normalized)) throw new Error("Manual code must be 6 letters or numbers")
  return normalized
}

export function assertAllowedColor(color: string) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error("Choose a valid six-digit color")
}

export function assertDisplayName(name: string) {
  const value = name.trim()
  if (value.length < 1 || value.length > 32) throw new Error("Display name must be 1–32 characters")
  return value
}

export function assertAvatarUrl(avatarUrl: string | undefined) {
  if (avatarUrl === undefined) return undefined
  if (avatarUrl.length > MAX_AVATAR_URL_LENGTH)
    throw new Error(`Avatar URL must be at most ${MAX_AVATAR_URL_LENGTH} characters`)
  let parsed: URL
  try {
    parsed = new URL(avatarUrl)
  } catch {
    throw new Error("Avatar URL must be a valid HTTPS URL")
  }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password)
    throw new Error("Avatar URL must be a valid HTTPS URL without credentials")
  if (parsed.href.length > MAX_AVATAR_URL_LENGTH)
    throw new Error(
      `Avatar URL must be at most ${MAX_AVATAR_URL_LENGTH} characters after normalization`,
    )
  return parsed.href
}

export function inviteIsUsable(invite: { expiresAt: number; revokedAt?: number }, now: number) {
  return invite.revokedAt === undefined && invite.expiresAt > now
}
