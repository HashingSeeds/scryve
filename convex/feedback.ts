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
import { PREMIUM_FEATURES, hasFeature } from "./lib/entitlements"
import {
  APOLLO_ACTIONS,
  APOLLO_KEY_PREFIX,
  FEEDBACK_LIMITS,
  cleanText,
  deletedFeedbackCard,
  feedbackCard,
  feedbackKind,
  feedbackStatus,
  senderHash,
} from "./lib/feedback"

const limiter = new RateLimiter(components.rateLimiter, {
  feedbackSubmit: { kind: "token bucket", rate: 5, period: HOUR, capacity: 5 },
  feedbackMessage: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
  feedbackVote: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },
})

const BOARD_SIZE = 100
const MINE_SIZE = 50
const THREAD_SIZE = 200
const DELETE_BATCH = 20
const APOLLO_BATCH = 100

type Ctx = QueryCtx | MutationCtx
type Viewer = { hash: string; user: Doc<"users"> | null }

async function signedInUser(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
    .unique()
}

async function viewer(ctx: Ctx, key: string): Promise<Viewer> {
  return { hash: await senderHash(key), user: await signedInUser(ctx) }
}

function owns(request: Doc<"feedbackRequests">, { hash, user }: Viewer) {
  return request.senderHash === hash || (!!user && request.userId === user._id)
}

async function ownedRequest(ctx: Ctx, who: Viewer, requestId: Id<"feedbackRequests">) {
  const request = await ctx.db.get(requestId)
  if (!request || !owns(request, who))
    throw new ConvexError({ code: "not_found", message: "Feedback not found" })
  return request
}

async function limit(
  ctx: MutationCtx,
  name: "feedbackSubmit" | "feedbackMessage" | "feedbackVote",
  key: string,
) {
  const result = await limiter.limit(ctx, name, { key })
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

function boardItem(request: Doc<"feedbackRequests">, voted: boolean, mine: boolean) {
  return {
    _id: request._id,
    kind: request.kind,
    title: request.title,
    body: request.body,
    status: request.status,
    votes: request.votes,
    shippedIn: request.shippedIn,
    createdAt: request._creationTime,
    voted,
    mine,
  }
}

function ownItem(request: Doc<"feedbackRequests">) {
  return {
    ...boardItem(request, false, true),
    published: request.published,
    unread: request.unread,
    linked: request.userId !== undefined,
    updatedAt: request.updatedAt,
  }
}

export const board = query({
  args: { key: v.optional(v.string()), status: v.optional(feedbackStatus) },
  handler: async (ctx, { key, status }) => {
    const who = key ? await viewer(ctx, key) : null
    const requests = await (
      status
        ? ctx.db
            .query("feedbackRequests")
            .withIndex("by_published_and_status_and_votes", (q) =>
              q.eq("published", true).eq("status", status),
            )
        : ctx.db
            .query("feedbackRequests")
            .withIndex("by_published_and_votes", (q) => q.eq("published", true))
    )
      .order("desc")
      .take(BOARD_SIZE)
    return await Promise.all(
      requests.map(async (request) => {
        const voted = who
          ? !!(await ctx.db
              .query("feedbackVotes")
              .withIndex("by_request_and_sender", (q) =>
                q.eq("requestId", request._id).eq("senderHash", who.hash),
              )
              .unique())
          : false
        return boardItem(request, voted, !!who && owns(request, who))
      }),
    )
  },
})

export const mine = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const who = await viewer(ctx, key)
    const fromInstall = await ctx.db
      .query("feedbackRequests")
      .withIndex("by_sender_and_updated_at", (q) => q.eq("senderHash", who.hash))
      .order("desc")
      .take(MINE_SIZE)
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

export const thread = query({
  args: { key: v.string(), requestId: v.id("feedbackRequests") },
  handler: async (ctx, { key, requestId }) => {
    const who = await viewer(ctx, key)
    const request = await ctx.db.get(requestId)
    if (!request || !owns(request, who)) return null
    const messages = await ctx.db
      .query("feedbackMessages")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .take(THREAD_SIZE)
    return {
      request: { ...ownItem(request), canLink: !!who.user },
      messages: messages.map(({ _id, _creationTime, from, body }) => ({
        _id,
        createdAt: _creationTime,
        from,
        body,
      })),
    }
  },
})

export const submit = mutation({
  args: {
    key: v.string(),
    kind: feedbackKind,
    title: v.string(),
    body: v.string(),
    includeAccount: v.boolean(),
    appVersion: v.optional(v.string()),
    platform: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const who = await viewer(ctx, args.key)
    const userId = args.includeAccount ? who.user?._id : undefined
    if (args.includeAccount && !userId)
      throw new ConvexError({ code: "unauthenticated", message: "Sign in to include your account" })
    await limit(ctx, "feedbackSubmit", who.hash)
    const now = Date.now()
    const vote = args.kind === "feature"
    const requestId = await ctx.db.insert("feedbackRequests", {
      kind: args.kind,
      title: cleanText(args.title, FEEDBACK_LIMITS.title, "Title"),
      body: cleanText(args.body, FEEDBACK_LIMITS.body, "Details"),
      status: "review",
      published: false,
      votes: vote ? 1 : 0,
      senderHash: who.hash,
      userId,
      appVersion: args.appVersion?.slice(0, FEEDBACK_LIMITS.version),
      platform: args.platform?.slice(0, FEEDBACK_LIMITS.version),
      unread: false,
      updatedAt: now,
    })
    if (vote) await ctx.db.insert("feedbackVotes", { requestId, senderHash: who.hash })
    await postCard(ctx, requestId)
    return requestId
  },
})

export const vote = mutation({
  args: { key: v.string(), requestId: v.id("feedbackRequests"), voted: v.boolean() },
  handler: async (ctx, { key, requestId, voted }) => {
    const who = await viewer(ctx, key)
    const request = await ctx.db.get(requestId)
    if (!request || (!request.published && !owns(request, who)))
      throw new ConvexError({ code: "not_found", message: "Feedback not found" })
    await limit(ctx, "feedbackVote", who.hash)
    const existing = await ctx.db
      .query("feedbackVotes")
      .withIndex("by_request_and_sender", (q) =>
        q.eq("requestId", requestId).eq("senderHash", who.hash),
      )
      .unique()
    if (voted === !!existing) return null
    if (existing) await ctx.db.delete(existing._id)
    else await ctx.db.insert("feedbackVotes", { requestId, senderHash: who.hash })
    await ctx.db.patch(requestId, { votes: Math.max(0, request.votes + (voted ? 1 : -1)) })
    return null
  },
})

export const reply = mutation({
  args: { key: v.string(), requestId: v.id("feedbackRequests"), body: v.string() },
  handler: async (ctx, { key, requestId, body }) => {
    const who = await viewer(ctx, key)
    await ownedRequest(ctx, who, requestId)
    await limit(ctx, "feedbackMessage", who.hash)
    await ctx.db.insert("feedbackMessages", {
      requestId,
      from: "player",
      body: cleanText(body, FEEDBACK_LIMITS.message, "Message"),
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

async function deleteSenderBatch(ctx: MutationCtx, hash: string) {
  const requests = await ctx.db
    .query("feedbackRequests")
    .withIndex("by_sender_and_updated_at", (q) => q.eq("senderHash", hash))
    .take(DELETE_BATCH)
  for (const request of requests) {
    const messages = await ctx.db
      .query("feedbackMessages")
      .withIndex("by_request", (q) => q.eq("requestId", request._id))
      .take(THREAD_SIZE)
    for (const message of messages) await ctx.db.delete(message._id)
    const votes = await ctx.db
      .query("feedbackVotes")
      .withIndex("by_request_and_sender", (q) => q.eq("requestId", request._id))
      .take(THREAD_SIZE)
    for (const vote of votes) await ctx.db.delete(vote._id)
    // why: a request with more messages or votes than one batch stays until the next pass.
    if (messages.length < THREAD_SIZE && votes.length < THREAD_SIZE) {
      await ctx.db.delete(request._id)
      await ctx.scheduler.runAfter(0, internal.feedback.postApolloCard, {
        requestId: request._id,
        deleted: true,
      })
    }
  }
  const votes = await ctx.db
    .query("feedbackVotes")
    .withIndex("by_sender", (q) => q.eq("senderHash", hash))
    .take(THREAD_SIZE)
  for (const vote of votes) {
    await ctx.db.delete(vote._id)
    const request = await ctx.db.get(vote.requestId)
    if (request) await ctx.db.patch(request._id, { votes: Math.max(0, request.votes - 1) })
  }
  if (requests.length === DELETE_BATCH || votes.length === THREAD_SIZE)
    await ctx.scheduler.runAfter(0, internal.feedback.continueDeleteMine, { hash })
}

export const apolloCardInput = internalQuery({
  args: { requestId: v.id("feedbackRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId)
    if (!request) return null
    const messages = await ctx.db
      .query("feedbackMessages")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .take(THREAD_SIZE)
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
    const action = APOLLO_ACTIONS.find((id) => id === event.actionId)
    if (!request || !action) return null
    const text = event.text?.trim()
    const now = Date.now()
    switch (action) {
      case "reply":
        if (!text) return null
        await ctx.db.insert("feedbackMessages", {
          requestId: request._id,
          from: "team",
          body: text.slice(0, FEEDBACK_LIMITS.message),
        })
        await ctx.db.patch(request._id, { unread: true, updatedAt: now })
        break
      case "publish":
      case "hide":
        await ctx.db.patch(request._id, { published: action === "publish" })
        break
      case "shipped":
        await ctx.db.patch(request._id, {
          status: "shipped",
          shippedIn: text ? text.slice(0, FEEDBACK_LIMITS.version) : undefined,
          unread: true,
          updatedAt: now,
        })
        break
      default:
        await ctx.db.patch(request._id, {
          status: action,
          shippedIn: undefined,
          unread: true,
          updatedAt: now,
        })
    }
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
    })
    if (!response.ok) {
      console.warn(`Apollo events failed: ${response.status}`)
      return null
    }
    const events: unknown = await response.json()
    if (!Array.isArray(events)) return null
    // why: every event moves the cursor, even one this ignores, or the pull would read it forever.
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
