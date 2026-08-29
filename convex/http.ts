import { httpRouter } from "convex/server"
import { Webhook } from "svix"

import { internal } from "./_generated/api"
import { env, httpAction } from "./_generated/server"

const http = httpRouter()

const waitlistPlatforms = ["web", "ios", "android"] as const
type WaitlistPlatform = (typeof waitlistPlatforms)[number]

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isWaitlistPlatform(value: unknown): value is WaitlistPlatform {
  return typeof value === "string" && waitlistPlatforms.includes(value as WaitlistPlatform)
}

function readWaitlistSubmission(value: unknown) {
  const record = asRecord(value)
  if (!record) return null
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : ""
  const platforms = Array.isArray(record.platforms)
    ? [...new Set(record.platforms.filter(isWaitlistPlatform))]
    : []
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || platforms.length === 0) return null
  return { email, platforms }
}

http.route({
  path: "/waitlist/submissions",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!env.WAITLIST_INGEST_SECRET)
      return new Response("Wait-list ingestion is not configured", { status: 503 })
    if (request.headers.get("authorization") !== `Bearer ${env.WAITLIST_INGEST_SECRET}`)
      return new Response("Unauthorized", { status: 401 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return new Response("Invalid request", { status: 400 })
    }
    const submission = readWaitlistSubmission(body)
    if (!submission) return new Response("Invalid submission", { status: 400 })

    const result = await ctx.runMutation(internal.waitlist.submit, submission)
    return Response.json(result, { headers: { "cache-control": "no-store" } })
  }),
})

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
    if (event?.type === "user.created" || event?.type === "user.updated") {
      const data = asRecord(event.data)
      if (!data) return new Response("Clerk user event is missing its data", { status: 400 })
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
