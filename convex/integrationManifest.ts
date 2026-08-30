import { ConvexError, v } from "convex/values"

import { internalMutation, internalQuery, query } from "./_generated/server"
import {
  CAPABILITY_KEYS,
  capabilityState,
  GAME_SYSTEM_IDS,
  INTEGRATIONS,
  type CapabilityKey,
} from "./lib/integrations"

const capabilityKeyValidator = v.union(
  v.literal("integration"),
  v.literal("cardCatalog"),
  v.literal("deckImport"),
  v.literal("exampleDecks"),
  v.literal("images"),
  v.literal("playTracking"),
  v.literal("aggregateMetagameStats"),
)

const releaseValidator = v.union(
  v.literal("enabled"),
  v.literal("permission_required"),
  v.literal("disabled"),
)

export const list = query({
  args: {},
  handler: async (ctx) =>
    await Promise.all(
      GAME_SYSTEM_IDS.map(async (game) => ({
        ...INTEGRATIONS[game],
        capabilities: Object.fromEntries(
          await Promise.all(
            CAPABILITY_KEYS.map(async (key) => [key, await capabilityState(ctx, game, key)]),
          ),
        ) as Record<CapabilityKey, Awaited<ReturnType<typeof capabilityState>>>,
      })),
    ),
})

export const getCapabilityState = internalQuery({
  args: { game: v.string(), capability: capabilityKeyValidator },
  handler: async (ctx, args) => await capabilityState(ctx, args.game, args.capability),
})

export const setCapabilityOverride = internalMutation({
  args: {
    game: v.string(),
    capability: capabilityKeyValidator,
    release: releaseValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!GAME_SYSTEM_IDS.includes(args.game as (typeof GAME_SYSTEM_IDS)[number]))
      throw new ConvexError({ code: "unknown_game", message: "Unknown game system" })
    const existing = await ctx.db
      .query("integrationOverrides")
      .withIndex("by_game_and_capability", (query) =>
        query.eq("game", args.game).eq("capability", args.capability),
      )
      .unique()
    const value = {
      game: args.game,
      capability: args.capability,
      release: args.release,
      ...(args.note ? { note: args.note } : {}),
      updatedAt: Date.now(),
    }
    if (existing) {
      await ctx.db.replace(existing._id, value)
      return existing._id
    }
    return await ctx.db.insert("integrationOverrides", value)
  },
})
