import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError, v } from "convex/values"

import { components, internal } from "./_generated/api"
import { internalAction, internalMutation, mutation, type MutationCtx } from "./_generated/server"
import { signedInUser } from "./feedback"
import { senderHash } from "./lib/feedback"
import {
  RENEWAL_REMINDER_LEAD_MS,
  USER_DEVICES,
  notificationLocale,
  notifyRenewal,
  pushMessage,
} from "./lib/notifications"
import { objectRecord } from "./lib/scryfall"

const limiter = new RateLimiter(components.rateLimiter, {
  pushDeviceNew: { kind: "fixed window", rate: 300, period: HOUR },
})

const EXPO_TOKEN = /^Expo(?:nent)?PushToken\[[\w-]{1,200}\]$/

async function deviceFor(ctx: MutationCtx, key: string) {
  const hash = await senderHash(key)
  const device = await ctx.db
    .query("pushDevices")
    .withIndex("by_sender_hash", (q) => q.eq("senderHash", hash))
    .unique()
  return { hash, device }
}

export const syncDevice = mutation({
  args: {
    key: v.string(),
    token: v.string(),
    locale: v.optional(v.string()),
    feedbackReplies: v.boolean(),
    renewalReminders: v.boolean(),
  },
  handler: async (ctx, { key, token, locale, feedbackReplies, renewalReminders }) => {
    if (!EXPO_TOKEN.test(token))
      throw new ConvexError({ code: "invalid_token", message: "Invalid push token" })
    const { hash, device } = await deviceFor(ctx, key)
    const user = await signedInUser(ctx)
    const value = {
      senderHash: hash,
      userId: user?._id,
      token,
      locale: notificationLocale(locale),
      feedbackReplies,
      renewalReminders: renewalReminders && !!user,
    }
    if (device) {
      await ctx.db.replace(device._id, value)
      return null
    }
    if (!(await limiter.limit(ctx, "pushDeviceNew")).ok)
      throw new ConvexError({ code: "rate_limited", message: "Try again later." })
    await ctx.db.insert("pushDevices", value)
    return null
  },
})

export const forgetDevice = mutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const { device } = await deviceFor(ctx, key)
    if (device) await ctx.db.delete(device._id)
    return null
  },
})

function unregisteredTokens(messages: { to: string }[], body: unknown) {
  const data = objectRecord(body)?.data
  const tickets: unknown[] = Array.isArray(data) ? data : [data]
  return messages
    .filter(
      (_, index) =>
        objectRecord(objectRecord(tickets[index])?.details)?.error === "DeviceNotRegistered",
    )
    .map((message) => message.to)
}

export const send = internalAction({
  args: { messages: v.array(pushMessage), retried: v.optional(v.boolean()) },
  handler: async (ctx, { messages, retried }) => {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(
        messages.map((message) => ({ ...message, sound: "default", channelId: "default" })),
      ),
    }).catch(() => null)
    const temporary = !response || response.status === 429 || response.status >= 500
    if (temporary && !retried) {
      await ctx.scheduler.runAfter(MINUTE, internal.notifications.send, { messages, retried: true })
      return null
    }
    if (!response?.ok) {
      console.warn(`Expo push failed: ${response?.status ?? "network error"}`)
      return null
    }
    const tokens = unregisteredTokens(messages, await response.json().catch(() => null))
    if (tokens.length) await ctx.runMutation(internal.notifications.forgetTokens, { tokens })
    return null
  },
})

export const forgetTokens = internalMutation({
  args: { tokens: v.array(v.string()) },
  handler: async (ctx, { tokens }) => {
    for (const token of tokens) {
      const devices = await ctx.db
        .query("pushDevices")
        .withIndex("by_token", (q) => q.eq("token", token))
        .take(USER_DEVICES)
      for (const device of devices) await ctx.db.delete(device._id)
    }
    return null
  },
})

export const remindRenewals = internalMutation({
  args: { hour: v.optional(v.number()), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // why: runs on the hour, and the one-hour windows tile, so each renewal is reminded once without storing that it was.
    const hour = args.hour ?? Math.floor(Date.now() / HOUR) * HOUR
    const page = await ctx.db
      .query("revenueCatCustomerStates")
      .withIndex("by_renews_at", (q) =>
        q
          .gte("renewsAt", hour + RENEWAL_REMINDER_LEAD_MS)
          .lt("renewsAt", hour + HOUR + RENEWAL_REMINDER_LEAD_MS),
      )
      .paginate({ numItems: 100, cursor: args.cursor ?? null })
    for (const state of page.page) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", state.appUserId))
        .unique()
      if (user) await notifyRenewal(ctx, user._id, state.foil === true)
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.notifications.remindRenewals, {
        hour,
        cursor: page.continueCursor,
      })
    return null
  },
})
