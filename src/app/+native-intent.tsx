import { normalizeInvitePayload } from "@/features/connected/inviteLinks"
import { sharedDeckToken } from "@/features/decks/shareLinks"
import { isPreviewBuild } from "@/features/lan/lanAvailability"

function isSafeInternalPath(path: string): boolean {
  if (path === "/") return true
  if (!path.startsWith("/") || path.startsWith("//")) return false
  if (/[\\?#%\u0000-\u001F\u007F]/.test(path)) return false
  return /^\/(?:[A-Za-z0-9_-]+\/?)+$/.test(path)
}

const DEV_SEED_LINK =
  /^(?:(?:scryve|count)(?:-dev|-preview)?:\/\/\/?|\/)dev\/seed\/([a-z]+)(\?[^#\s\u0000-\u001F\u007F]*)?$/

/**
 * why: preview builds open PR previews from `scryve-preview://preview/pr-123`, or from the QR code
 * in the pr-preview comment, which qr.expo.dev can only encode as a development-client link.
 */
const PR_PREVIEW_LINK =
  /^(?:(?:scryve|count)-preview:\/\/(?:\/?preview\/|expo-development-client\/\?url=https:\/\/u\.expo\.dev\/[0-9a-f-]+\?channel-name=)|\/preview\/)(pr-[0-9]+)$/

// why: agents drive nearby games on devices they can't tap through these links, including release-mode preview builds.
const LAN_TEST_LINK =
  /^(?:(?:scryve|count)-(?:dev|preview):\/\/\/?|\/)lan(\?(?:[A-Za-z0-9=&]|%[0-9A-Fa-f]{2})+)?$/

function devSeedPath(path: string): string | null {
  const match = DEV_SEED_LINK.exec(path)
  return match ? `/dev/seed/${match[1]}${match[2] ?? ""}` : null
}

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  const trustedOrigin = process.env.EXPO_PUBLIC_INVITE_ORIGIN
  const sharedDeck = sharedDeckToken(path, trustedOrigin)
  if (sharedDeck) return `/deck/${sharedDeck}`
  const invite = normalizeInvitePayload(path, trustedOrigin)
  if (invite?.kind === "token") return `/join/${encodeURIComponent(invite.token)}`
  if (invite?.kind === "code") return `/connected/join?code=${encodeURIComponent(invite.code)}`
  const preview = PR_PREVIEW_LINK.exec(path)?.[1]
  if (preview) return `/preview/${preview}`
  const seed = __DEV__ ? devSeedPath(path) : null
  if (seed) return seed
  const lan = __DEV__ || isPreviewBuild() ? LAN_TEST_LINK.exec(path) : null
  if (lan) return `/lan${lan[1] ?? ""}`
  // Warm intents may preserve only a deliberately small absolute in-app route grammar.
  return !initial && isSafeInternalPath(path) ? path : "/"
}
