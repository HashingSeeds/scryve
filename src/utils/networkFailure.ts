/** why: losing signal is routine; reporting it floods Sentry and stops release promotion. */
export function isNetworkFailure(error: unknown) {
  if (!(error instanceof Error)) return false
  const code = "code" in error ? error.code : undefined
  return (
    code === "clerk_offline" ||
    code === "network_error" ||
    /network (error|request failed)|failed to fetch|connection lost/i.test(error.message)
  )
}
