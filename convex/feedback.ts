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
  feedbackReport: { kind: "token bucket", rate: 10, period: HOUR, capacity: 5 },
  feedbackReportHide: { kind: "fixed window", rate: 20, period: HOUR },
  feedbackSubmitAll: { kind: "fixed window", rate: 200, period: HOUR },
})

const BOARD_SIZE = 100
const MINE_SIZE = 50
const THREAD_SIZE = 200
const DELETE_BATCH = 20
const ACCOUNT_DELETE_BATCH = 10
const APOLLO_BATCH = 100
const SEARCH_SIZE = 50
const BODY_EXCERPT = 280
const CLIENT_ID = /^[A-Za-z0-9_-]{8,64}$/
const SENTRY_EVENT_ID = /^[0-9a-f]{32}$/

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
  name:
    "feedbackSubmit" | "feedbackSubmitAll" | "feedbackMessage" | "feedbackVote" | "feedbackReport",
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

function boardItem(
  request: Doc<"feedbackRequests">,
  { voted, reported, mine }: { voted: boolean; reported: boolean; mine: boolean },
) {
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
    reported,
    mine,
  }
}

function ownItem(request: Doc<"feedbackRequests">) {
  return {
    ...boardItem(request, { voted: false, reported: false, mine: true }),
    published: request.published,
    unread: request.unread,
    linked: request.userId !== undefined,
    updatedAt: request.updatedAt,
  }
}

const excerpt = (request: Doc<"feedbackRequests">) => ({
  ...request,
  body: request.body.slice(0, BODY_EXCERPT),
})

async function boardItems(ctx: QueryCtx, who: Viewer | null, requests: Doc<"feedbackRequests">[]) {
  return await Promise.all(
    requests.map(async (request) => {
      if (!who) return boardItem(request, { voted: false, reported: false, mine: false })
      const bySender = (table: "feedbackVotes" | "feedbackReports") =>
        ctx.db
          .query(table)
          .withIndex("by_request_and_sender", (q) =>
            q.eq("requestId", request._id).eq("senderHash", who.hash),
          )
          .unique()
      return boardItem(request, {
        voted: !!(await bySender("feedbackVotes")),
        reported: !!(await bySender("feedbackReports")),
        mine: owns(request, who),
      })
    }),
  )
}

async function searchPublished(
  ctx: QueryCtx,
  text: string,
  filter: { kind?: Doc<"feedbackRequests">["kind"]; status?: Doc<"feedbackRequests">["status"] },
) {
  const search = (index: "search_title" | "search_body", field: "title" | "body") =>
    ctx.db
      .query("feedbackRequests")
      .withSearchIndex(index, (q) => {
        const base = q.search(field, text).eq("published", true)
        const kind = filter.kind ? base.eq("kind", filter.kind) : base
        return filter.status ? kind.eq("status", filter.status) : kind
      })
      .take(SEARCH_SIZE)
  const byTitle = await search("search_title", "title")
  const byBody = await search("search_body", "body")
  const seen = new Set(byTitle.map((request) => request._id))
  return [...byTitle, ...byBody.filter((request) => !seen.has(request._id))]
}

export const board = query({
  args: {
    key: v.optional(v.string()),
    status: v.optional(feedbackStatus),
    kind: v.optional(feedbackKind),
    q: v.optional(v.string()),
  },
  handler: async (ctx, { key, status, kind, q }) => {
    const who = key ? await viewer(ctx, key) : null
    const text = q?.trim().slice(0, FEEDBACK_LIMITS.title)
    const requests = text
      ? await searchPublished(ctx, text, { kind, status })
      : await (
          status
            ? ctx.db
                .query("feedbackRequests")
                .withIndex("by_published_and_status_and_votes", (q) =>
                  q.eq("published", true).eq("status", status),
                )
            : kind
              ? ctx.db
                  .query("feedbackRequests")
                  .withIndex("by_published_and_kind_and_votes", (q) =>
                    q.eq("published", true).eq("kind", kind),
                  )
              : ctx.db
                  .query("feedbackRequests")
                  .withIndex("by_published_and_votes", (q) => q.eq("published", true))
        )
          .order("desc")
          .take(BOARD_SIZE)
    const shown =
      kind && !status ? requests.filter((request) => request.status !== "declined") : requests
    return await boardItems(ctx, who, shown.map(excerpt))
  },
})

export const published = query({
  args: { key: v.optional(v.string()), requestId: v.string() },
  handler: async (ctx, { key, requestId }) => {
    const id = ctx.db.normalizeId("feedbackRequests", requestId)
    const request = id ? await ctx.db.get(id) : null
    if (!request?.published) return null
    const [item] = await boardItems(ctx, key ? await viewer(ctx, key) : null, [request])
    return item ?? null
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
      .map((request) => {
        const { body: _body, ...item } = ownItem(request)
        return item
      })
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
      original: request.original ?? null,
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
  args: { key: v.string(), requestId: v.id("feedbackRequests") },
  handler: async (ctx, { key, requestId }) =>
    await threadFor(ctx, await viewer(ctx, key), await ctx.db.get(requestId)),
})

export const threadById = query({
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
    title: v.string(),
    body: v.string(),
    includeAccount: v.boolean(),
    appVersion: v.optional(v.string()),
    platform: v.optional(v.string()),
    clientId: v.optional(v.string()),
    sentryEventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const who = await viewer(ctx, args.key)
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
    const vote = args.kind === "feature"
    const requestId = await ctx.db.insert("feedbackRequests", {
      kind: args.kind,
      title: cleanText(args.title, FEEDBACK_LIMITS.title, "Title"),
      body: cleanText(args.body, FEEDBACK_LIMITS.body, "Details"),
      status: "review",
      published: false,
      votes: vote ? 1 : 0,
      reports: 0,
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

export const report = mutation({
  args: { key: v.string(), requestId: v.id("feedbackRequests") },
  handler: async (ctx, { key, requestId }) => {
    const who = await viewer(ctx, key)
    const request = await ctx.db.get(requestId)
    if (!request || !request.published || owns(request, who))
      throw new ConvexError({ code: "not_found", message: "Feedback not found" })
    const existing = await ctx.db
      .query("feedbackReports")
      .withIndex("by_request_and_sender", (q) =>
        q.eq("requestId", requestId).eq("senderHash", who.hash),
      )
      .unique()
    if (existing) return null
    await limit(ctx, "feedbackReport", who.hash)
    await ctx.db.insert("feedbackReports", { requestId, senderHash: who.hash })
    // why: the terms promise action on every report within 24 hours, so a report hides the request until Matthew publishes it again; past the shared cap it still reaches him but stays up.
    const hide = (await limiter.limit(ctx, "feedbackReportHide")).ok
    await ctx.db.patch(requestId, {
      reports: request.reports + 1,
      ...(hide ? { published: false } : {}),
    })
    await postCard(ctx, requestId)
    return null
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
    const who = await viewer(ctx, key)
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

async function deleteRequest(ctx: MutationCtx, request: Doc<"feedbackRequests">) {
  let done = true
  for (const table of ["feedbackMessages", "feedbackVotes", "feedbackReports"] as const) {
    const rows =
      table === "feedbackMessages"
        ? await ctx.db
            .query(table)
            .withIndex("by_request", (q) => q.eq("requestId", request._id))
            .take(THREAD_SIZE)
        : await ctx.db
            .query(table)
            .withIndex("by_request_and_sender", (q) => q.eq("requestId", request._id))
            .take(THREAD_SIZE)
    for (const row of rows) await ctx.db.delete(row._id)
    if (rows.length === THREAD_SIZE) done = false
  }
  if (!done) return false
  await ctx.db.delete(request._id)
  await ctx.scheduler.runAfter(0, internal.feedback.postApolloCard, {
    requestId: request._id,
    deleted: true,
  })
  return true
}

async function deleteSenderBatch(ctx: MutationCtx, hash: string) {
  const requests = await ctx.db
    .query("feedbackRequests")
    .withIndex("by_sender_and_updated_at", (q) => q.eq("senderHash", hash))
    .take(DELETE_BATCH)
  let more = requests.length === DELETE_BATCH
  for (const request of requests) if (!(await deleteRequest(ctx, request))) more = true
  const votes = await ctx.db
    .query("feedbackVotes")
    .withIndex("by_sender", (q) => q.eq("senderHash", hash))
    .take(THREAD_SIZE)
  for (const vote of votes) {
    await ctx.db.delete(vote._id)
    const request = await ctx.db.get(vote.requestId)
    if (request) await ctx.db.patch(request._id, { votes: Math.max(0, request.votes - 1) })
  }
  const reports = await ctx.db
    .query("feedbackReports")
    .withIndex("by_sender", (q) => q.eq("senderHash", hash))
    .take(THREAD_SIZE)
  for (const report of reports) {
    await ctx.db.delete(report._id)
    const request = await ctx.db.get(report.requestId)
    if (request) await ctx.db.patch(request._id, { reports: Math.max(0, request.reports - 1) })
  }
  if (more || votes.length === THREAD_SIZE || reports.length === THREAD_SIZE)
    await ctx.scheduler.runAfter(0, internal.feedback.continueDeleteMine, { hash })
}

export async function deleteAccountFeedback(ctx: MutationCtx, userId: Id<"users">) {
  const linked = await ctx.db
    .query("feedbackRequests")
    .withIndex("by_user_and_updated_at", (q) => q.eq("userId", userId))
    .take(ACCOUNT_DELETE_BATCH)
  for (const request of linked) await deleteRequest(ctx, request)
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
      case "edit": {
        const [title = "", ...rest] = (text ?? "").split("\n")
        const edited = { title: title.trim(), body: rest.join("\n").trim() }
        if (
          !edited.title ||
          !edited.body ||
          edited.title.length > FEEDBACK_LIMITS.title ||
          edited.body.length > FEEDBACK_LIMITS.body ||
          (edited.title === request.title && edited.body === request.body)
        )
          return null
        await ctx.db.patch(request._id, {
          ...edited,
          original: request.original ?? { title: request.title, body: request.body },
          unread: true,
          updatedAt: now,
        })
        break
      }
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
