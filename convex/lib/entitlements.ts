import { ConvexError } from "convex/values"

import { FREE_DECK_LIMIT, FREE_DECK_VERSIONS, MAX_DECK_VERSIONS, MAX_PREMIUM_DECKS } from "./policy"
import type { Doc } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

export const PREMIUM_FEATURES = {
  fullHistory: "full_history",
  unlimitedDecks: "unlimited_decks",
  deckAnalytics: "deck_analytics",
  deckVersions: "deck_versions",
} as const

type Ctx = QueryCtx | MutationCtx

export async function hasFeature(ctx: Ctx, user: Doc<"users">, feature: string) {
  const entitlement = await ctx.db
    .query("userEntitlements")
    .withIndex("by_user_and_feature", (q) => q.eq("userId", user._id).eq("feature", feature))
    .unique()
  return entitlement?.enabled === true
}

export async function requireFeature(ctx: Ctx, user: Doc<"users">, feature: string) {
  if (!(await hasFeature(ctx, user, feature))) throw new Error("Premium feature required")
}

export async function deckCapacity(ctx: Ctx, user: Doc<"users">) {
  const premium = await hasFeature(ctx, user, PREMIUM_FEATURES.unlimitedDecks)
  const limit = premium ? MAX_PREMIUM_DECKS : FREE_DECK_LIMIT
  const active = await ctx.db
    .query("decks")
    .withIndex("by_owner_and_archived_at", (q) =>
      q.eq("ownerUserId", user._id).eq("archivedAt", undefined),
    )
    .take(MAX_PREMIUM_DECKS + 1)
  const used = active.length
  return { used, limit, premium, canCreate: used < limit }
}

export function versionCapacity(premium: boolean, used: number) {
  const limit = premium ? MAX_DECK_VERSIONS : FREE_DECK_VERSIONS
  return { used, limit, premium, canCreate: used < limit }
}

export async function deckVersionCapacity(ctx: Ctx, user: Doc<"users">, used: number) {
  return versionCapacity(await hasFeature(ctx, user, PREMIUM_FEATURES.deckVersions), used)
}

export async function requireVersionCapacity(ctx: Ctx, user: Doc<"users">, used: number) {
  const capacity = await deckVersionCapacity(ctx, user, used)
  if (!capacity.canCreate)
    throw new ConvexError({
      code: "version_limit_reached",
      message: capacity.premium
        ? `A deck may hold at most ${MAX_DECK_VERSIONS} versions`
        : "Premium is required for extra deck versions",
    })
  return capacity
}

export async function requireDeckCapacity(ctx: Ctx, user: Doc<"users">) {
  const capacity = await deckCapacity(ctx, user)
  if (!capacity.canCreate)
    throw new ConvexError({
      code: "deck_limit_reached",
      message: capacity.premium ? "Deck limit reached" : "Premium is required for additional decks",
    })
  return capacity
}
