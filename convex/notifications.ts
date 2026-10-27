import { HOUR, RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError, v } from "convex/values"

import { components } from "./_generated/api"
import { internalAction, internalMutation, mutation, type MutationCtx } from "./_generated/server"
import { signedInUser } from "./feedback"
import { senderHash } from "./lib/feedback"
import {
  RENEWAL_REMINDER_LEAD_MS,
  notificationLocale,
  notifyRenewal,
  pushMessage,
} from "./lib/notifications"

const limiter = new RateLimiter(components.rateLimiter, {
  pushDeviceNew: { kind: "fixed window", rate: 300, period: HOUR },
})

const EXPO_TOKEN = /^Expo(?:nent)?PushToken\[[\w-]{1,200}\]$/

async function deviceFor(ctx: MutationCtx, key: string) {
  const hash = await senderHash(key)
  const device = await ctx.db
    .query("pushDevices")
    .withIndex("by_sender", (q) => q.eq("senderHash", hash))
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

export const send = internalAction({
  args: { messages: v.array(pushMessage) },
  handler: async (_ctx, { messages }) => {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(
        messages.map((message) => ({ ...message, sound: "default", channelId: "default" })),
      ),
    }).catch(() => null)
    if (!response?.ok) console.warn(`Expo push failed: ${response?.status ?? "network error"}`)
    return null
  },
})

export const remindRenewals = internalMutation({
  args: {},
  handler: async (ctx) => {
    // why: runs on the hour, and the one-hour windows tile, so each renewal is reminded once without storing that it was.
    const hour = Math.floor(Date.now() / HOUR) * HOUR
    const due = await ctx.db
      .query("revenueCatCustomerStates")
      .withIndex("by_renews_at", (q) =>
        q
          .gte("renewsAt", hour + RENEWAL_REMINDER_LEAD_MS)
          .lt("renewsAt", hour + HOUR + RENEWAL_REMINDER_LEAD_MS),
      )
      .take(500)
    for (const state of due) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", state.appUserId))
        .unique()
      if (user) await notifyRenewal(ctx, user._id, state.foil === true)
    }
    return null
  },
})
