import { normalizeInvitePayload } from "@/features/connected/inviteLinks"

function isSafeInternalPath(path: string): boolean {
  if (path === "/") return true
  if (!path.startsWith("/") || path.startsWith("//")) return false
  if (/[\\?#%\u0000-\u001F\u007F]/.test(path)) return false
  return /^\/(?:[A-Za-z0-9_-]+\/?)+$/.test(path)
}

const DEV_SEED_ROUTE = /^\/dev\/seed\/[a-z]+$/

/**
 * why: seed links carry their state in the query, which the warm route grammar
 * rejects, and arrive as `scryve-dev://dev/seed/...` where the host is the first segment.
 */
function devSeedPath(path: string): string | null {
  try {
    const url = new URL(path, "scryve-dev:///")
    const route = url.host ? `/${url.host}${url.pathname}` : url.pathname
    return DEV_SEED_ROUTE.test(route) ? `${route}${url.search}` : null
  } catch {
    return null
  }
}

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  const trustedOrigin = process.env.EXPO_PUBLIC_INVITE_ORIGIN
  const invite = normalizeInvitePayload(path, trustedOrigin)
  if (invite?.kind === "token") return `/join/${encodeURIComponent(invite.token)}`
  if (invite?.kind === "code") return `/connected/join?code=${encodeURIComponent(invite.code)}`
  const seed = __DEV__ ? devSeedPath(path) : null
  if (seed) return seed
  // Warm intents may preserve only a deliberately small absolute in-app route grammar.
  return !initial && isSafeInternalPath(path) ? path : "/"
}
