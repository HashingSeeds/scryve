export function validateClerkIssuerDomain(value: string | undefined) {
  const guidance =
    "Set CLERK_JWT_ISSUER_DOMAIN to the exact HTTPS Clerk issuer origin, for example https://example.clerk.accounts.dev"
  if (!value) throw new Error(`CLERK_JWT_ISSUER_DOMAIN is missing. ${guidance}`)
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`CLERK_JWT_ISSUER_DOMAIN is invalid. ${guidance}`)
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    value !== parsed.origin
  )
    throw new Error(`CLERK_JWT_ISSUER_DOMAIN must be an exact HTTPS origin. ${guidance}`)
  return parsed.origin
}
