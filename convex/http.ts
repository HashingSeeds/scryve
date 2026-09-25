import { httpRouter } from "convex/server"
import { Webhook } from "svix"

import { internal } from "./_generated/api"
import { env, httpAction } from "./_generated/server"
import {
  fetchRevenueCatSnapshot,
  revenueCatEnvironment,
  type RevenueCatEnvironment,
} from "./lib/revenueCat"

const http = httpRouter()

const waitlistPlatforms = ["web", "ios", "android"] as const
type WaitlistPlatform = (typeof waitlistPlatforms)[number]
type RevenueCatEvent = {
  id: string
  timestampMs: number
  environment?: RevenueCatEnvironment
} & (
  | { kind: "test" }
  | { kind: "transfer"; transfer: { transferredFrom: string[]; transferredTo: string[] } }
  | { kind: "subscriber"; appUserId: string; appUserIds: string[] }
)

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isWaitlistPlatform(value: unknown): value is WaitlistPlatform {
  return typeof value === "string" && waitlistPlatforms.includes(value as WaitlistPlatform)
}

function readStringArray(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.length > 1024 ||
    value.some((item) => typeof item !== "string")
  )
    return null
  return [...new Set(value)] as string[]
}

function readRevenueCatEvent(value: unknown): RevenueCatEvent | null {
  const body = asRecord(value)
  const event = body ? asRecord(body.event) : null
  if (!event || typeof event.id !== "string" || event.id.length === 0 || event.id.length > 200)
    return null
  if (typeof event.event_timestamp_ms !== "number" || !Number.isFinite(event.event_timestamp_ms))
    return null
  const environment: RevenueCatEnvironment | undefined | null =
    event.environment === undefined
      ? undefined
      : event.environment === "PRODUCTION" || event.environment === "SANDBOX"
        ? event.environment
        : null
  if (environment === null) return null
  const common = { id: event.id, timestampMs: event.event_timestamp_ms, environment }
  if (event.type === "TEST") return { ...common, kind: "test" }
  if (event.type === "TRANSFER") {
    const transferredFrom = readStringArray(event.transferred_from)
    const transferredTo = readStringArray(event.transferred_to)
    if (!transferredFrom?.length || !transferredTo?.length) return null
    return {
      ...common,
      kind: "transfer",
      transfer: { transferredFrom, transferredTo },
    }
  }
  if (typeof event.app_user_id !== "string" || event.app_user_id.length === 0) return null
  const aliases = readStringArray(event.aliases ?? [])
  if (!aliases) return null
  const originalAppUserId =
    typeof event.original_app_user_id === "string" ? event.original_app_user_id : undefined
  return {
    ...common,
    kind: "subscriber",
    appUserId: event.app_user_id,
    appUserIds: [
      ...new Set([event.app_user_id, originalAppUserId, ...aliases].filter(Boolean)),
    ] as string[],
  }
}

async function fetchTransferSnapshots(
  transfer: { transferredFrom: string[]; transferredTo: string[] },
  apiKey: string,
  environment: RevenueCatEnvironment,
) {
  const appUserIds = [...new Set([...transfer.transferredFrom, ...transfer.transferredTo])]
  return await Promise.all(
    appUserIds.map(async (appUserId) => ({
      appUserIds: [appUserId],
      ...(await fetchRevenueCatSnapshot(appUserId, apiKey, environment)),
    })),
  )
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
  path: "/revenuecat/webhooks",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!env.REVENUECAT_WEBHOOK_AUTH || !env.REVENUECAT_SECRET_API_KEY)
      return new Response("RevenueCat is not configured", { status: 503 })
    if (request.headers.get("authorization") !== env.REVENUECAT_WEBHOOK_AUTH)
      return new Response("Unauthorized", { status: 401 })
    const configuredEnvironment = revenueCatEnvironment(env.REVENUECAT_ENVIRONMENT)
    if (!configuredEnvironment)
      return new Response("RevenueCat environment is invalid", { status: 503 })

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return new Response("Invalid request", { status: 400 })
    }
    const event = readRevenueCatEvent(body)
    if (!event) return new Response("Invalid RevenueCat event", { status: 400 })
    const processed: boolean = await ctx.runQuery(internal.revenuecat.hasProcessedWebhook, {
      eventId: event.id,
    })
    if (processed) return new Response("ok", { status: 200 })

    try {
      const snapshots =
        event.kind === "test" || (event.environment && event.environment !== configuredEnvironment)
          ? []
          : event.kind === "transfer"
            ? await fetchTransferSnapshots(
                event.transfer,
                env.REVENUECAT_SECRET_API_KEY,
                configuredEnvironment,
              )
            : [
                {
                  appUserIds: event.appUserIds,
                  ...(await fetchRevenueCatSnapshot(
                    event.appUserId,
                    env.REVENUECAT_SECRET_API_KEY,
                    configuredEnvironment,
                  )),
                },
              ]
      await ctx.runMutation(internal.revenuecat.commitSync, {
        environment: configuredEnvironment,
        snapshots,
        event: {
          id: event.id,
          timestampMs: event.timestampMs,
          environment: event.environment,
        },
      })
      return new Response("ok", { status: 200 })
    } catch (cause) {
      console.error("RevenueCat webhook sync failed", cause)
      return new Response("RevenueCat sync failed", { status: 502 })
    }
  }),
})

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
