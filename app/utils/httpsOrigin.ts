export function normalizeHttpsOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null
    const port = url.port ? `:${url.port}` : ""
    return `https://${url.hostname.toLowerCase()}${port}`
  } catch {
    return null
  }
}
