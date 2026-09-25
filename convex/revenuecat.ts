import { v } from "convex/values"

import { internal } from "./_generated/api"
import { action, env, internalMutation, internalQuery } from "./_generated/server"
import { hasAccountDeletion } from "./lib/auth"
import {
  applyRevenueCatState,
  fetchRevenueCatSnapshot,
  revenueCatEnvironment,
} from "./lib/revenueCat"

const environmentValidator = v.union(v.literal("PRODUCTION"), v.literal("SANDBOX"))
const snapshotValidator = v.object({
  appUserIds: v.array(v.string()),
  enabled: v.boolean(),
  observedAt: v.number(),
})

export const hasProcessedWebhook = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, args) =>
    Boolean(
      await ctx.db
        .query("revenueCatWebhookEvents")
        .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
        .unique(),
    ),
})

export const commitSync = internalMutation({
  args: {
    environment: environmentValidator,
    snapshots: v.array(snapshotValidator),
    event: v.optional(
      v.object({
        id: v.string(),
        timestampMs: v.number(),
        environment: v.optional(environmentValidator),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (
      args.event &&
      (await ctx.db
        .query("revenueCatWebhookEvents")
        .withIndex("by_event_id", (q) => q.eq("eventId", args.event!.id))
        .unique())
    )
      return { duplicate: true, syncedUsers: 0 }

    const syncedUserIds = new Set<string>()
    for (const snapshot of args.snapshots) {
      for (const appUserId of new Set(snapshot.appUserIds)) {
        if (await hasAccountDeletion(ctx, appUserId)) continue
        const current = await ctx.db
          .query("revenueCatCustomerStates")
          .withIndex("by_app_user_id", (q) => q.eq("appUserId", appUserId))
          .unique()
        if (current && current.observedAt >= snapshot.observedAt) continue
        const value = {
          enabled: snapshot.enabled,
          environment: args.environment,
          observedAt: snapshot.observedAt,
          updatedAt: Date.now(),
        }
        if (current) await ctx.db.patch(current._id, value)
        else await ctx.db.insert("revenueCatCustomerStates", { appUserId, ...value })

        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", appUserId))
          .unique()
        if (user && !syncedUserIds.has(user._id)) {
          await applyRevenueCatState(ctx, user, snapshot)
          syncedUserIds.add(user._id)
        }
      }
    }
    if (args.event)
      await ctx.db.insert("revenueCatWebhookEvents", {
        eventId: args.event.id,
        eventTimestampMs: args.event.timestampMs,
        environment: args.event.environment,
        processedAt: Date.now(),
      })
    return { duplicate: false, syncedUsers: syncedUserIds.size }
  },
})

export const syncCurrent = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Authentication required")
    if (!env.REVENUECAT_SECRET_API_KEY) throw new Error("RevenueCat is not configured")
    const environment = revenueCatEnvironment(env.REVENUECAT_ENVIRONMENT)
    if (!environment) throw new Error("RevenueCat environment is invalid")
    const snapshot = await fetchRevenueCatSnapshot(
      identity.subject,
      env.REVENUECAT_SECRET_API_KEY,
      environment,
    )
    const result: { syncedUsers: number } = await ctx.runMutation(internal.revenuecat.commitSync, {
      environment,
      snapshots: [{ appUserIds: [identity.subject], ...snapshot }],
    })
    return { synced: result.syncedUsers > 0, enabled: snapshot.enabled }
  },
})
