import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { action, internalMutation, internalQuery } from "./_generated/server"
import {
  type CardReference,
  fetchScryfall,
  normalizeScryfallCard,
  objectRecord,
} from "./lib/scryfall"

const MAX_SEARCH_RESULTS = 20

async function requireActionIdentity(ctx: { auth: { getUserIdentity: () => Promise<unknown> } }) {
  if (!(await ctx.auth.getUserIdentity()))
    throw new ConvexError({ code: "unauthenticated", message: "Authentication required" })
}

export const search = action({
  args: { query: v.string() },
  handler: async (ctx, args): Promise<CardReference[]> => {
    await requireActionIdentity(ctx)
    const query = args.query.trim()
    if (query.length < 2 || query.length > 120) return []
    const path = `/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=name`
    const response = await fetchScryfall(ctx, path)
    if (response.status === 404) return []
    if (!response.ok)
      throw new ConvexError({
        code: "scryfall_unavailable",
        message: `Card search is temporarily unavailable (${response.status})`,
      })
    const payload = objectRecord((await response.json()) as unknown)
    const data = Array.isArray(payload?.data) ? payload.data : []
    const cards = data
      .map(normalizeScryfallCard)
      .filter((card): card is CardReference => card !== null)
      .slice(0, MAX_SEARCH_RESULTS)
    if (cards.length > 0) await ctx.runMutation(internal.cards.cacheMany, { cards })
    return cards
  },
})

function isCompleteReference(cached: Doc<"cardReferences">) {
  return cached.setName !== undefined
}

function toCardReference(cached: Doc<"cardReferences">): CardReference {
  const { _id: _, _creationTime: __, updatedAt: ___, ...reference } = cached
  return reference
}

export const byId = action({
  args: { scryfallId: v.string() },
  handler: async (ctx, args): Promise<CardReference> => {
    await requireActionIdentity(ctx)
    if (!/^[0-9a-f-]{36}$/i.test(args.scryfallId))
      throw new ConvexError({ code: "invalid_card_identifier", message: "Invalid card identifier" })
    const cached: Doc<"cardReferences"> | null = await ctx.runQuery(internal.cards.cachedById, args)
    if (cached && isCompleteReference(cached)) return toCardReference(cached)
    const response = await fetchScryfall(ctx, `/cards/${encodeURIComponent(args.scryfallId)}`)
    if (!response.ok)
      throw new ConvexError({
        code: "scryfall_unavailable",
        message: `Card lookup is temporarily unavailable (${response.status})`,
      })
    const card = normalizeScryfallCard((await response.json()) as unknown)
    if (!card)
      throw new ConvexError({
        code: "scryfall_invalid_response",
        message: "Card service returned an invalid response",
      })
    await ctx.runMutation(internal.cards.cache, card)
    return card
  },
})

export const cachedById = internalQuery({
  args: { scryfallId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("cardReferences")
      .withIndex("by_scryfall_id", (q) => q.eq("scryfallId", args.scryfallId))
      .unique(),
})

const cardReferenceValidator = v.object({
  scryfallId: v.string(),
  oracleId: v.string(),
  name: v.string(),
  imageUrl: v.optional(v.string()),
  smallImageUrl: v.optional(v.string()),
  manaCost: v.optional(v.string()),
  typeLine: v.optional(v.string()),
  oracleText: v.optional(v.string()),
  setName: v.optional(v.string()),
  setCode: v.optional(v.string()),
  collectorNumber: v.optional(v.string()),
  rarity: v.optional(v.string()),
})

async function upsertCardReference(ctx: MutationCtx, card: CardReference) {
  const existing = await ctx.db
    .query("cardReferences")
    .withIndex("by_scryfall_id", (q) => q.eq("scryfallId", card.scryfallId))
    .unique()
  const value = { ...card, updatedAt: Date.now() }
  if (existing) {
    await ctx.db.patch(existing._id, value)
    return existing._id
  }
  return await ctx.db.insert("cardReferences", value)
}

export const cache = internalMutation({
  args: cardReferenceValidator.fields,
  handler: async (ctx, args) => await upsertCardReference(ctx, args),
})

export const cacheMany = internalMutation({
  args: { cards: v.array(cardReferenceValidator) },
  handler: async (ctx, args) => {
    for (const card of args.cards) await upsertCardReference(ctx, card)
    return null
  },
})
