import { createClerkClient } from "@clerk/backend"

import { type PagesEnv, requireEnv } from "./env"

const PUBLIC_FUNCTION_PATHS = new Set(["/api/waitlist"])

export const onRequest: PagesFunction<PagesEnv> = async (context) => {
  if (context.env.WAITLIST_GATE_ENABLED !== "true") return context.next()

  const url = new URL(context.request.url)
  if (PUBLIC_FUNCTION_PATHS.has(url.pathname)) return context.next()

  try {
    const origin = requireEnv(context.env, "APP_ORIGIN")
    const clerk = createClerkClient({
      publishableKey: requireEnv(context.env, "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"),
      secretKey: requireEnv(context.env, "CLERK_SECRET_KEY"),
    })
    const auth = await clerk.authenticateRequest(context.request, {
      authorizedParties: [origin],
    })
    if (auth.isAuthenticated) return context.next()
  } catch (error) {
    console.error(JSON.stringify({ event: "waitlist_gate_error", error: String(error) }))
    return new Response("Scryve is temporarily unavailable", { status: 503 })
  }

  const returnTo = `${url.pathname}${url.search}`
  const waitlistUrl = new URL("/waitlist/", url.origin)
  if (returnTo !== "/") waitlistUrl.searchParams.set("return_to", returnTo)
  return Response.redirect(waitlistUrl, 302)
}
