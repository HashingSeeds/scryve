import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError, v } from "convex/values"

import { components, internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { hasAccountDeletion } from "./lib/auth"
import { PREMIUM_FEATURES, hasFeature } from "./lib/entitlements"
import {
  APOLLO_KEY_PREFIX,
  FEEDBACK_LIMITS,
  cleanText,
  deletedFeedbackCard,
  feedbackCard,
  feedbackKind,
  senderHash,
} from "./lib/feedback"

const limiter = new RateLimiter(components.rateLimiter, {
  feedbackSubmit: { kind: "token bucket", rate: 5, period: HOUR, capacity: 5 },
  feedbackMessage: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
  feedbackSubmitAll: { kind: "fixed window", rate: 200, period: HOUR },
})

const MINE_SIZE = 50
const THREAD_SIZE = 200
const DELETE_BATCH = 20
const ACCOUNT_DELETE_BATCH = 10
const DELETE_MESSAGES_PER_MUTATION = 400
const APOLLO_BATCH = 100
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/
const SENTRY_EVENT_ID = /^[0-9a-f]{32}$/

type Ctx = QueryCtx | MutationCtx
type Viewer = { hash: string | null; user: Doc<"users"> | null }

async function signedInUser(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity || (await hasAccountDeletion(ctx, identity.subject))) return null
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
    .unique()
}

async function sender(ctx: Ctx, key: string) {
  return { hash: await senderHash(key), user: await signedInUser(ctx) }
}

async function viewer(ctx: Ctx, key: string | undefined): Promise<Viewer> {
  return key ? await sender(ctx, key) : { hash: null, user: await signedInUser(ctx) }
}

function owns(request: Doc<"feedbackRequests">, { hash, user }: Viewer) {
  return (!!hash && request.senderHash === hash) || (!!user && request.userId === user._id)
}

async function ownedRequest(ctx: Ctx, who: Viewer, requestId: Id<"feedbackRequests">) {
  const request = await ctx.db.get(requestId)
  if (!request || !owns(request, who))
    throw new ConvexError({ code: "not_found", message: "Feedback not found" })
  return request
}

async function limit(
  ctx: MutationCtx,
  name: "feedbackSubmit" | "feedbackSubmitAll" | "feedbackMessage",
  key?: string,
) {
  const result = await limiter.limit(ctx, name, key ? { key } : {})
  if (!result.ok)
    throw new ConvexError({
      code: "rate_limited",
      message: `Try again in ${Math.ceil(result.retryAfter / 1000)} seconds.`,
      retryAfterMs: result.retryAfter,
    })
}

async function postCard(ctx: MutationCtx, requestId: Id<"feedbackRequests">) {
  await ctx.scheduler.runAfter(0, internal.feedback.postApolloCard, { requestId })
}

function ownItem(request: Doc<"feedbackRequests">) {
  return {
    _id: request._id,
    kind: request.kind,
    body: request.body,
    unread: request.unread,
    linked: request.userId !== undefined,
    createdAt: request._creationTime,
    updatedAt: request.updatedAt,
  }
}

export const mine = query({
  args: { key: v.optional(v.string()) },
  handler: async (ctx, { key }) => {
    const who = await viewer(ctx, key)
    const hash = who.hash
    const fromInstall = hash
      ? await ctx.db
          .query("feedbackRequests")
          .withIndex("by_sender_and_updated_at", (q) => q.eq("senderHash", hash))
          .order("desc")
          .take(MINE_SIZE)
      : []
    const user = who.user
    const fromAccount = user
      ? await ctx.db
          .query("feedbackRequests")
          .withIndex("by_user_and_updated_at", (q) => q.eq("userId", user._id))
          .order("desc")
          .take(MINE_SIZE)
      : []
    const byId = new Map([...fromInstall, ...fromAccount].map((request) => [request._id, request]))
    return [...byId.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MINE_SIZE)
      .map(ownItem)
  },
})

async function latestMessages(ctx: QueryCtx, requestId: Id<"feedbackRequests">) {
  const newest = await ctx.db
    .query("feedbackMessages")
    .withIndex("by_request", (q) => q.eq("requestId", requestId))
    .order("desc")
    .take(THREAD_SIZE)
  return newest.reverse()
}

async function threadFor(ctx: QueryCtx, who: Viewer, request: Doc<"feedbackRequests"> | null) {
  if (!request || !owns(request, who)) return null
  const messages = await latestMessages(ctx, request._id)
  return {
    request: {
      ...ownItem(request),
      canLink: !!who.user,
      linkedElsewhere:
        !!who.user && request.userId !== undefined && request.userId !== who.user._id,
    },
    messages: messages.map(({ _id, _creationTime, from, body }) => ({
      _id,
      createdAt: _creationTime,
      from,
      body,
    })),
  }
}

export const thread = query({
  args: { key: v.string(), requestId: v.string() },
  handler: async (ctx, { key, requestId }) => {
    const id = ctx.db.normalizeId("feedbackRequests", requestId)
    return await threadFor(ctx, await viewer(ctx, key), id ? await ctx.db.get(id) : null)
  },
})

function checkClientId(clientId: string | undefined) {
  if (clientId !== undefined && !CLIENT_ID.test(clientId))
    throw new ConvexError({ code: "invalid_client_id", message: "Invalid client id" })
}

export const submit = mutation({
  args: {
    key: v.string(),
    kind: feedbackKind,
    body: v.string(),
    includeAccount: v.boolean(),
    appVersion: v.optional(v.string()),
    platform: v.optional(v.string()),
    clientId: v.optional(v.string()),
    sentryEventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const who = await sender(ctx, args.key)
    checkClientId(args.clientId)
    if (args.clientId) {
      const sent = await ctx.db
        .query("feedbackRequests")
        .withIndex("by_sender_and_client_id", (q) =>
          q.eq("senderHash", who.hash).eq("clientId", args.clientId),
        )
        .first()
      if (sent) return sent._id
    }
    const userId = args.includeAccount ? who.user?._id : undefined
    if (args.includeAccount && !userId)
      throw new ConvexError({ code: "unauthenticated", message: "Sign in to include your account" })
    await limit(ctx, "feedbackSubmit", who.hash)
    await limit(ctx, "feedbackSubmitAll")
    const now = Date.now()
    const requestId = await ctx.db.insert("feedbackRequests", {
      kind: args.kind,
      body: cleanText(args.body, FEEDBACK_LIMITS.body, "Message"),
      senderHash: who.hash,
      userId,
      appVersion: args.appVersion?.slice(0, FEEDBACK_LIMITS.version),
      platform: args.platform?.slice(0, FEEDBACK_LIMITS.version),
      clientId: args.clientId,
      sentryEventId:
        args.sentryEventId && SENTRY_EVENT_ID.test(args.sentryEventId)
          ? args.sentryEventId
          : undefined,
      unread: false,
      updatedAt: now,
    })
    await postCard(ctx, requestId)
    return requestId
  },
})

export const reply = mutation({
  args: {
    key: v.string(),
    requestId: v.id("feedbackRequests"),
    body: v.string(),
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, { key, requestId, body, clientId }) => {
    const who = await sender(ctx, key)
    await ownedRequest(ctx, who, requestId)
    checkClientId(clientId)
    if (
      clientId &&
      (await ctx.db
        .query("feedbackMessages")
        .withIndex("by_request_and_client_id", (q) =>
          q.eq("requestId", requestId).eq("clientId", clientId),
        )
        .first())
    )
      return null
    await limit(ctx, "feedbackMessage", who.hash)
    await ctx.db.insert("feedbackMessages", {
      requestId,
      from: "player",
      body: cleanText(body, FEEDBACK_LIMITS.message, "Message"),
      clientId,
    })
    await ctx.db.patch(requestId, { updatedAt: Date.now() })
    await postCard(ctx, requestId)
    return null
  },
})

export const markRead = mutation({
  args: { key: v.string(), requestId: v.id("feedbackRequests") },
  handler: async (ctx, { key, requestId }) => {
    const request = await ownedRequest(ctx, await viewer(ctx, key), requestId)
    if (request.unread) await ctx.db.patch(requestId, { unread: false })
    return null
  },
})

export const setAccount = mutation({
  args: { key: v.string(), requestId: v.id("feedbackRequests"), included: v.boolean() },
  handler: async (ctx, { key, requestId, included }) => {
    const who = await viewer(ctx, key)
    const request = await ownedRequest(ctx, who, requestId)
    if (!who.user)
      throw new ConvexError({ code: "unauthenticated", message: "Sign in to include your account" })
    if (request.userId !== undefined && request.userId !== who.user._id)
      throw new ConvexError({ code: "not_found", message: "Feedback not found" })
    const userId = included ? who.user._id : undefined
    if (request.userId === userId) return null
    await ctx.db.patch(requestId, { userId })
    await postCard(ctx, requestId)
    return null
  },
})

export const deleteMine = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    await deleteSenderBatch(ctx, await senderHash(key))
    return null
  },
})

export const continueDeleteMine = internalMutation({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    await deleteSenderBatch(ctx, hash)
    return null
  },
})

async function deleteRequests(ctx: MutationCtx, requests: Doc<"feedbackRequests">[]) {
  let budget = DELETE_MESSAGES_PER_MUTATION
  let removed = 0
  for (const request of requests) {
    const limit = budget
    if (limit === 0) break
    const messages = await ctx.db
      .query("feedbackMessages")
      .withIndex("by_request", (q) => q.eq("requestId", request._id))
      .take(limit)
    for (const message of messages) await ctx.db.delete(message._id)
    budget -= messages.length
    if (messages.length === limit) break
    await ctx.db.delete(request._id)
    await ctx.scheduler.runAfter(0, internal.feedback.postApolloCard, {
      requestId: request._id,
      deleted: true,
    })
    removed += 1
  }
  return removed
}

async function deleteSenderBatch(ctx: MutationCtx, hash: string) {
  const requests = await ctx.db
    .query("feedbackRequests")
    .withIndex("by_sender_and_updated_at", (q) => q.eq("senderHash", hash))
    .take(DELETE_BATCH)
  const removed = await deleteRequests(ctx, requests)
  if (requests.length === DELETE_BATCH || removed < requests.length)
    await ctx.scheduler.runAfter(0, internal.feedback.continueDeleteMine, { hash })
}

export async function deleteAccountFeedback(ctx: MutationCtx, userId: Id<"users">) {
  const linked = await ctx.db
    .query("feedbackRequests")
    .withIndex("by_user_and_updated_at", (q) => q.eq("userId", userId))
    .take(ACCOUNT_DELETE_BATCH)
  await deleteRequests(ctx, linked)
  return linked.length
}

export const apolloCardInput = internalQuery({
  args: { requestId: v.id("feedbackRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId)
    if (!request) return null
    const messages = await latestMessages(ctx, requestId)
    const user = request.userId ? await ctx.db.get(request.userId) : null
    const account = user
      ? [
          user.moderationHold?.placeholderUsername ??
            (user.username ? `@${user.username}` : user.displayName),
          ...((await hasFeature(ctx, user, PREMIUM_FEATURES.proDecksLimit)) ? ["Pro"] : []),
        ].join(" · ")
      : undefined
    return { request, messages, account }
  },
})

function apolloConfig() {
  const url = env.APOLLO_CLOUD_URL
  const token = env.APOLLO_FEEDBACK_TOKEN
  return url && token ? { url: url.replace(/\/$/, ""), token } : null
}

const APOLLO_RETRY_MS = [MINUTE, 10 * MINUTE] as const
// why: a stalled Apollo would otherwise hold the action until Convex kills it, skipping the retry.
const APOLLO_TIMEOUT_MS = 15_000

export const postApolloCard = internalAction({
  args: {
    requestId: v.id("feedbackRequests"),
    deleted: v.optional(v.boolean()),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apollo = apolloConfig()
    if (!apollo) return null
    const { requestId, deleted } = args
    const input = deleted
      ? null
      : await ctx.runQuery(internal.feedback.apolloCardInput, { requestId })
    if (!deleted && !input) return null
    const card = input ? feedbackCard(input) : deletedFeedbackCard(requestId)
    const status = await fetch(`${apollo.url}/v1/cards`, {
      method: "POST",
      signal: AbortSignal.timeout(APOLLO_TIMEOUT_MS),
      headers: { "Authorization": `Bearer ${apollo.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(card),
    }).then(
      (response) => response.status,
      () => 0,
    )
    if (status >= 200 && status < 300) return null
    const attempt = args.attempt ?? 0
    const delay = APOLLO_RETRY_MS[attempt]
    if (status >= 400 && status < 500)
      console.warn(`Apollo refused the card for ${requestId}: ${status}`)
    else if (delay !== undefined)
      await ctx.scheduler.runAfter(delay, internal.feedback.postApolloCard, {
        ...args,
        attempt: attempt + 1,
      })
    else console.warn(`Apollo card for ${requestId} failed after retries: ${status}`)
    return null
  },
})

export const apolloCursor = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("feedbackApolloCursor").first())?.after ?? 0,
})

const apolloEvent = v.object({
  seq: v.number(),
  key: v.string(),
  actionId: v.optional(v.string()),
  text: v.optional(v.string()),
})

export const applyApolloEvent = internalMutation({
  args: { event: apolloEvent },
  handler: async (ctx, { event }) => {
    const cursor = await ctx.db.query("feedbackApolloCursor").first()
    if (event.seq <= (cursor?.after ?? 0)) return null
    if (cursor) await ctx.db.patch(cursor._id, { after: event.seq })
    else await ctx.db.insert("feedbackApolloCursor", { after: event.seq })

    const requestId = event.key.startsWith(APOLLO_KEY_PREFIX)
      ? ctx.db.normalizeId("feedbackRequests", event.key.slice(APOLLO_KEY_PREFIX.length))
      : null
    const request = requestId ? await ctx.db.get(requestId) : null
    const text = event.text?.trim()
    if (!request || event.actionId !== "reply" || !text) return null
    await ctx.db.insert("feedbackMessages", {
      requestId: request._id,
      from: "team",
      body: text.slice(0, FEEDBACK_LIMITS.message),
    })
    await ctx.db.patch(request._id, { unread: true, updatedAt: Date.now() })
    await postCard(ctx, request._id)
    return null
  },
})

export const pullApollo = internalAction({
  args: {},
  handler: async (ctx) => {
    const apollo = apolloConfig()
    if (!apollo) return null
    const after = await ctx.runQuery(internal.feedback.apolloCursor, {})
    const response = await fetch(`${apollo.url}/v1/events?after=${after}&source=feedback`, {
      headers: { Authorization: `Bearer ${apollo.token}` },
      signal: AbortSignal.timeout(APOLLO_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.warn(`Apollo events failed: ${response.status}`)
      return null
    }
    const events: unknown = await response.json()
    if (!Array.isArray(events)) return null
    for (const event of events.slice(0, APOLLO_BATCH)) {
      if (typeof event !== "object" || event === null) continue
      const { seq, key, type, actionId, text } = event as Record<string, unknown>
      if (typeof seq !== "number" || typeof key !== "string") continue
      await ctx.runMutation(internal.feedback.applyApolloEvent, {
        event: {
          seq,
          key,
          ...(type === "action" && typeof actionId === "string" ? { actionId } : {}),
          ...(typeof text === "string" ? { text } : {}),
        },
      })
    }
    return null
  },
})
