import { normalizeHttpsOrigin } from "@/utils/httpsOrigin"

import { normalizeWatchCode } from "../../../convex/lib/watchCode"

export function watchUrl(origin: string, code: string) {
  const site = normalizeHttpsOrigin(origin)
  const watchCode = normalizeWatchCode(code)
  return site && watchCode ? `${site}/watch/${watchCode}` : null
}

// why: apple-app-site-association hands /watch links to the app, which would otherwise open them on Home.
export function watchCodeFromLink(link: string, trustedOrigin: string | undefined) {
  const origin = normalizeHttpsOrigin(trustedOrigin)
  if (!origin) return null
  try {
    const url = new URL(link)
    if (url.origin !== origin || url.username || url.password || url.search || url.hash) return null
    const code = /^\/watch\/([A-Za-z0-9]+)$/.exec(url.pathname)?.[1]
    return code ? normalizeWatchCode(code) : null
  } catch {
    return null
  }
}
