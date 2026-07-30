import { normalizeHttpsOrigin } from "@/utils/httpsOrigin"

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/
const CODE_PATTERN = /^[A-Z0-9]{6}$/

export type InvitePayload = { kind: "token"; token: string } | { kind: "code"; code: string }

export function normalizeManualCode(value: string): string | null {
  const code = value.trim().toUpperCase().replace(/[\s-]/g, "")
  return CODE_PATTERN.test(code) ? code : null
}

export function isInviteToken(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}

export function normalizeInvitePayload(
  payload: string,
  trustedOrigin?: string,
): InvitePayload | null {
  const code = normalizeManualCode(payload)
  if (code) return { kind: "code", code }

  try {
    const url = new URL(payload)
    const isCustomScheme = url.protocol === "count:" && url.hostname === "join"
    const normalizedOrigin = normalizeHttpsOrigin(trustedOrigin)
    const isTrustedHttps =
      url.protocol === "https:" && !!normalizedOrigin && url.origin === normalizedOrigin
    if (!isCustomScheme && !isTrustedHttps) return null
    if (url.username || url.password || url.search || url.hash) return null
    const match = (isCustomScheme ? url.pathname : url.pathname).match(
      /^\/([A-Za-z0-9_-]{43,128})$/,
    )
    if (!match || (!isCustomScheme && !url.pathname.startsWith("/join/"))) {
      const httpsMatch = isTrustedHttps
        ? url.pathname.match(/^\/join\/([A-Za-z0-9_-]{43,128})$/)
        : null
      return httpsMatch ? { kind: "token", token: httpsMatch[1] } : null
    }
    return isCustomScheme ? { kind: "token", token: match[1] } : null
  } catch {
    return null
  }
}

export function buildInviteUrl(origin: string, token: string): string | null {
  if (!isInviteToken(token)) return null
  try {
    const normalizedOrigin = normalizeHttpsOrigin(origin)
    if (!normalizedOrigin) return null
    const url = new URL(normalizedOrigin)
    url.pathname = `/join/${encodeURIComponent(token)}`
    return url.toString()
  } catch {
    return null
  }
}
