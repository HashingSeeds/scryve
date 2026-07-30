import { normalizeInvitePayload } from "@/features/connected/inviteLinks"

function isSafeInternalPath(path: string): boolean {
  if (path === "/") return true
  if (!path.startsWith("/") || path.startsWith("//")) return false
  if (/[\\?#%\u0000-\u001F\u007F]/.test(path)) return false
  return /^\/(?:[A-Za-z0-9_-]+\/?)+$/.test(path)
}

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  const trustedOrigin = process.env.EXPO_PUBLIC_INVITE_ORIGIN
  const invite = normalizeInvitePayload(path, trustedOrigin)
  if (invite?.kind === "token") return `/join/${encodeURIComponent(invite.token)}`
  // Warm intents may preserve only a deliberately small absolute in-app route grammar.
  return !initial && isSafeInternalPath(path) ? path : "/"
}
