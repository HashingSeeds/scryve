import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError, v } from "convex/values"

import { components, internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { internalAction, internalMutation, mutation, type MutationCtx } from "./_generated/server"
import { signedInUser } from "./feedback"
import { senderHash } from "./lib/feedback"
import {
  EXPO_PUSH_TOKEN,
  USER_DEVICES,
  notificationLocale,
  pushMessage,
  renewalReminderMessage,
  sendPush,
  uniqueByToken,
  type PushMessage,
} from "./lib/notifications"

const limiter = new RateLimiter(components.rateLimiter, {
  pushDeviceSync: { kind: "token bucket", rate: 20, period: HOUR, capacity: 10 },
  pushDeviceNew: { kind: "fixed window", rate: 300, period: HOUR },
})

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push"
const EXPO_TIMEOUT_MS = 15_000
const SEND_RETRY_MS = [MINUTE, 10 * MINUTE, HOUR, 6 * HOUR] as const
// why: Expo reports most dead tokens only in receipts, which are ready some minutes after the send.
const RECEIPT_DELAY_MS = 15 * MINUTE
const REMINDER_BATCH = 50

type DeviceFields = Omit<Doc<"pushDevices">, "_id" | "_creationTime" | "updatedAt">

function sameDevice(a: DeviceFields, b: DeviceFields) {
  return (
    a.userId === b.userId &&
    a.token === b.token &&
    a.platform === b.platform &&
    a.locale === b.locale &&
    a.feedbackReplies === b.feedbackReplies &&
    a.renewalReminders === b.renewalReminders
  )
}

async function limit(ctx: MutationCtx, name: "pushDeviceSync" | "pushDeviceNew", key?: string) {
  const result = await limiter.limit(ctx, name, key ? { key } : {})
  if (!result.ok)
    throw new ConvexError({
      code: "rate_limited",
      message: `Try again in ${Math.ceil(result.retryAfter / 1000)} seconds.`,
      retryAfterMs: result.retryAfter,
    })
}

export const forgetDevice = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const hash = await senderHash(key)
    const existing = await ctx.db
      .query("pushDevices")
      .withIndex("by_sender", (q) => q.eq("senderHash", hash))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
    return null
  },
})

export const syncDevice = mutation({
  args: {
    key: v.string(),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    locale: v.optional(v.string()),
    feedbackReplies: v.boolean(),
    renewalReminders: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!EXPO_PUSH_TOKEN.test(args.token))
      throw new ConvexError({ code: "invalid_token", message: "Invalid push token" })
    const hash = await senderHash(args.key)
    const existing = await ctx.db
      .query("pushDevices")
      .withIndex("by_sender", (q) => q.eq("senderHash", hash))
      .unique()
    const user = await signedInUser(ctx)
    const device: DeviceFields = {
      senderHash: hash,
      userId: user?._id,
      token: args.token,
      platform: args.platform,
      locale: notificationLocale(args.locale),
      feedbackReplies: args.feedbackReplies,
      renewalReminders: args.renewalReminders && !!user,
    }
    if (existing && sameDevice(existing, device)) return null
    await limit(ctx, "pushDeviceSync", hash)
    if (!existing) await limit(ctx, "pushDeviceNew")
    const value = { ...device, updatedAt: Date.now() }
    if (existing) await ctx.db.replace(existing._id, value)
    else await ctx.db.insert("pushDevices", value)
    return null
  },
})

async function postExpo(path: string, body: unknown) {
  return await fetch(`${EXPO_PUSH_URL}/${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(
    async (response) => (response.ok ? ((await response.json()) as unknown) : null),
    () => null,
  )
}

function deadToken(result: unknown) {
  if (typeof result !== "object" || result === null) return false
  const { status, details } = result as { status?: unknown; details?: { error?: unknown } }
  return status === "error" && details?.error === "DeviceNotRegistered"
}

export const send = internalAction({
  args: { messages: v.array(pushMessage), attempt: v.optional(v.number()) },
  handler: async (ctx, { messages, attempt = 0 }) => {
    const response = await postExpo(
      "send",
      messages.map(({ url, ...message }) => ({
        ...message,
        data: { url },
        sound: "default",
        channelId: "default",
      })),
    )
    const tickets = (response as { data?: unknown } | null)?.data
    if (!Array.isArray(tickets) || tickets.length !== messages.length) {
      const delay = SEND_RETRY_MS[attempt]
      if (delay === undefined) console.warn(`Push send failed after retries`)
      else
        await ctx.scheduler.runAfter(delay, internal.notifications.send, {
          messages,
          attempt: attempt + 1,
        })
      return null
    }
    const dead = messages.filter((_, index) => deadToken(tickets[index])).map(({ to }) => to)
    if (dead.length) await ctx.runMutation(internal.notifications.forgetTokens, { tokens: dead })
    const receipts = tickets.flatMap((ticket: unknown, index) => {
      const id = (ticket as { status?: unknown; id?: unknown } | null)?.id
      return typeof id === "string" ? [{ id, token: messages[index]!.to }] : []
    })
    if (receipts.length)
      await ctx.scheduler.runAfter(RECEIPT_DELAY_MS, internal.notifications.checkReceipts, {
        receipts,
      })
    return null
  },
})

export const checkReceipts = internalAction({
  args: { receipts: v.array(v.object({ id: v.string(), token: v.string() })) },
  handler: async (ctx, { receipts }) => {
    const response = await postExpo("getReceipts", { ids: receipts.map(({ id }) => id) })
    const results = (response as { data?: Record<string, unknown> } | null)?.data
    if (!results) return null
    const dead = receipts.filter(({ id }) => deadToken(results[id])).map(({ token }) => token)
    if (dead.length) await ctx.runMutation(internal.notifications.forgetTokens, { tokens: dead })
    return null
  },
})

export const forgetTokens = internalMutation({
  args: { tokens: v.array(v.string()) },
  handler: async (ctx, { tokens }) => {
    for (const token of new Set(tokens)) {
      const devices = await ctx.db
        .query("pushDevices")
        .withIndex("by_token", (q) => q.eq("token", token))
        .take(10)
      for (const device of devices) await ctx.db.delete(device._id)
    }
    return null
  },
})

export const remindRenewals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const due = await ctx.db
      .query("revenueCatCustomerStates")
      .withIndex("by_remind_at", (q) => q.gte("remindAt", 0).lte("remindAt", now))
      .take(REMINDER_BATCH)
    const messages: PushMessage[] = []
    for (const state of due) {
      await ctx.db.patch(state._id, { remindAt: undefined })
      if (!state.enabled || state.renewsAt === undefined || state.renewsAt <= now) continue
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", state.appUserId))
        .unique()
      if (!user) continue
      const devices = await ctx.db
        .query("pushDevices")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .take(USER_DEVICES)
      for (const device of uniqueByToken(devices.filter((device) => device.renewalReminders)))
        messages.push(renewalReminderMessage(device, state.foil === true))
    }
    await sendPush(ctx, messages)
    if (due.length === REMINDER_BATCH)
      await ctx.scheduler.runAfter(0, internal.notifications.remindRenewals, {})
    return null
  },
})
