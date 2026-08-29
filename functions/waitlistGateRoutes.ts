const PUBLIC_EXACT_PATHS = new Set(["/api/waitlist", "/favicon.ico", "/metadata.json"])

const PUBLIC_PAGE_PATHS = [
  "/waitlist",
  "/delete-account",
  "/privacy",
  "/terms",
  "/cookie-policy",
] as const

const PUBLIC_ASSET_PREFIXES = ["/_expo/", "/assets/", "/apple-touch-icon"] as const

export function shouldBypassWaitlistGate(pathname: string) {
  if (PUBLIC_EXACT_PATHS.has(pathname)) return true
  if (PUBLIC_PAGE_PATHS.some((route) => pathname === route || pathname.startsWith(`${route}/`)))
    return true
  return PUBLIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
