import { normalizeHttpsOrigin } from "@/utils/httpsOrigin"

const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/

export function isShareToken(value: string) {
  return SHARE_TOKEN.test(value)
}

export function shareUrl(origin: string, token: string) {
  const normalized = normalizeHttpsOrigin(origin)
  return normalized && isShareToken(token) ? `${normalized}/deck/${token}` : undefined
}

export function sharedDeckToken(link: string, trustedOrigin: string | undefined) {
  const origin = normalizeHttpsOrigin(trustedOrigin)
  if (!origin) return undefined
  try {
    const url = new URL(link)
    if (url.origin !== origin || url.username || url.password || url.search || url.hash)
      return undefined
    const token = /^\/deck\/([A-Za-z0-9_-]+)$/.exec(url.pathname)?.[1]
    return token && isShareToken(token) ? token : undefined
  } catch {
    return undefined
  }
}
