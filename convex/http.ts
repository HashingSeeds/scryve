import { httpRouter } from "convex/server"
import { Webhook } from "svix"

import { internal } from "./_generated/api"
import { env, httpAction } from "./_generated/server"

const http = httpRouter()

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

http.route({
  path: "/clerk/webhooks",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!env.CLERK_WEBHOOK_SIGNING_SECRET)
      return new Response("Webhook signing secret is not configured", { status: 503 })
    const body = await request.text()
    let payload: unknown
    try {
      payload = new Webhook(env.CLERK_WEBHOOK_SIGNING_SECRET).verify(body, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      })
    } catch {
      return new Response("Invalid webhook signature", { status: 400 })
    }
    const event = asRecord(payload)
    const data = asRecord(event?.data)
    if ((event?.type === "user.created" || event?.type === "user.updated") && data) {
      const clerkUserId = typeof data.id === "string" ? data.id : undefined
      const username = typeof data.username === "string" ? data.username : undefined
      if (!clerkUserId || !username)
        return new Response("Clerk user is missing a required username", { status: 400 })
      const firstName = typeof data.first_name === "string" ? data.first_name : ""
      const lastName = typeof data.last_name === "string" ? data.last_name : ""
      const displayName = `${firstName} ${lastName}`.trim() || username
      await ctx.runMutation(internal.users.syncFromClerk, {
        clerkUserId,
        username,
        displayName,
        ...(typeof data.image_url === "string" ? { avatarUrl: data.image_url } : {}),
      })
    }
    return new Response("ok", { status: 200 })
  }),
})

export default http
