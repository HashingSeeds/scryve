import { ConvexError, v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { internalMutation, internalQuery, query } from "./_generated/server"
import {
  MAX_CARD_FACES,
  MAX_CARD_FACETS,
  MAX_CATALOG_BATCH,
  normalizeCardName,
  type CatalogCard,
  type NormalizedCard,
} from "./lib/games/cards"
import { assertGameSystem, requireReleasedCapability } from "./lib/integrations"

const faceValidator = v.object({
  index: v.number(),
  name: v.optional(v.string()),
  text: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  smallImageUrl: v.optional(v.string()),
})

const printingValidator = v.object({
  provider: v.string(),
  providerCardId: v.string(),
  printingId: v.string(),
  setCode: v.optional(v.string()),
  collectorNumber: v.optional(v.string()),
  language: v.optional(v.string()),
  rarity: v.optional(v.string()),
  typeLabel: v.optional(v.string()),
  costLabel: v.optional(v.string()),
  faces: v.array(faceValidator),
})

export const normalizedCardValidator = v.object({
  game: v.union(v.literal("mtg"), v.literal("ygo"), v.literal("pokemon")),
  identityNamespace: v.string(),
  cardId: v.string(),
  name: v.string(),
  nameNormalized: v.string(),
  category: v.optional(v.string()),
  facets: v.array(v.object({ key: v.string(), value: v.string() })),
  printings: v.array(printingValidator),
})

function assertNormalizedCard(card: NormalizedCard) {
  if (!card.cardId.trim() || !card.name.trim() || card.name.length > 300)
    throw new ConvexError({ code: "invalid_card", message: "Card identity is invalid" })
  if (card.facets.length > MAX_CARD_FACETS)
    throw new ConvexError({ code: "invalid_card", message: "Card has too many facets" })
  if (card.printings.length < 1 || card.printings.length > MAX_CATALOG_BATCH)
    throw new ConvexError({ code: "invalid_card", message: "Card has too many printings" })
  for (const printing of card.printings) {
    if (printing.faces.length < 1 || printing.faces.length > MAX_CARD_FACES)
      throw new ConvexError({ code: "invalid_card", message: "Card has too many faces" })
  }
}

async function upsertCard(ctx: MutationCtx, card: NormalizedCard) {
  assertNormalizedCard(card)
  const existing = await ctx.db
    .query("gameCards")
    .withIndex("by_game_and_identity_namespace_and_card_id", (query) =>
      query
        .eq("game", card.game)
        .eq("identityNamespace", card.identityNamespace)
        .eq("cardId", card.cardId),
    )
    .unique()
  const now = Date.now()
  const logicalValue = {
    game: assertGameSystem(card.game),
    identityNamespace: card.identityNamespace,
    cardId: card.cardId,
    name: card.name.trim(),
    nameNormalized: normalizeCardName(card.name),
    ...(card.category ? { category: card.category } : {}),
    facets: card.facets,
    updatedAt: now,
  }
  const gameCardId = existing?._id ?? (await ctx.db.insert("gameCards", logicalValue))
  if (existing) await ctx.db.replace(existing._id, logicalValue)

  for (const printing of card.printings) {
    const stored = await ctx.db
      .query("cardPrintings")
      .withIndex("by_game_and_printing_id", (query) =>
        query.eq("game", card.game).eq("printingId", printing.printingId),
      )
      .unique()
    const value = { gameCardId, game: card.game, ...printing, updatedAt: now }
    if (stored) await ctx.db.replace(stored._id, value)
    else await ctx.db.insert("cardPrintings", value)
  }
  return gameCardId
}

export const cacheMany = internalMutation({
  args: { cards: v.array(normalizedCardValidator) },
  handler: async (ctx, args) => {
    if (args.cards.length > MAX_CATALOG_BATCH)
      throw new ConvexError({ code: "catalog_batch_too_large", message: "Card batch is too large" })
    for (const card of args.cards) await upsertCard(ctx, card)
    return null
  },
})

async function projectedCard(ctx: QueryCtx, card: Doc<"gameCards">): Promise<CatalogCard> {
  const printings = await ctx.db
    .query("cardPrintings")
    .withIndex("by_game_card_id", (query) => query.eq("gameCardId", card._id))
    .take(MAX_CATALOG_BATCH)
  const printing = printings[0]
  const face = printing?.faces[0]
  return {
    game: assertGameSystem(card.game),
    identityNamespace: card.identityNamespace,
    cardId: card.cardId,
    name: card.name,
    category: card.category,
    facets: card.facets,
    providerCardId: printing?.providerCardId,
    printingId: printing?.printingId,
    setCode: printing?.setCode,
    collectorNumber: printing?.collectorNumber,
    rarity: printing?.rarity,
    typeLabel: printing?.typeLabel,
    text: face?.text,
    imageUrl: face?.imageUrl,
    smallImageUrl: face?.smallImageUrl,
    faces: printing?.faces ?? [],
  }
}

export const searchCached = internalQuery({
  args: { game: v.string(), query: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit), 20))
    const cards = await ctx.db
      .query("gameCards")
      .withSearchIndex("search_name", (query) =>
        query.search("name", args.query).eq("game", args.game),
      )
      .take(limit)
    return await Promise.all(cards.map(async (card) => await projectedCard(ctx, card)))
  },
})

export const lookupCached = internalQuery({
  args: { game: v.string(), cardId: v.string() },
  handler: async (ctx, args) => {
    const integrationNamespace =
      args.game === "ygo"
        ? "ygoprodeck-card"
        : args.game === "pokemon"
          ? "tcgdex-card"
          : "scryfall-oracle"
    const logical = await ctx.db
      .query("gameCards")
      .withIndex("by_game_and_identity_namespace_and_card_id", (query) =>
        query
          .eq("game", args.game)
          .eq("identityNamespace", integrationNamespace)
          .eq("cardId", args.cardId),
      )
      .unique()
    if (logical) return await projectedCard(ctx, logical)
    const printing = await ctx.db
      .query("cardPrintings")
      .withIndex("by_game_and_printing_id", (query) =>
        query.eq("game", args.game).eq("printingId", args.cardId),
      )
      .unique()
    const card = printing ? await ctx.db.get(printing.gameCardId) : null
    return card ? await projectedCard(ctx, card) : null
  },
})

export const searchMirrored = query({
  args: { game: v.string(), query: v.string() },
  handler: async (ctx, args) => {
    const game = assertGameSystem(args.game)
    await requireReleasedCapability(ctx, game, "cardCatalog")
    const query = args.query.trim()
    if (query.length < 2 || query.length > 120) return []
    const cards = await ctx.db
      .query("gameCards")
      .withSearchIndex("search_name", (search) => search.search("name", query).eq("game", game))
      .take(20)
    return await Promise.all(cards.map(async (card) => await projectedCard(ctx, card)))
  },
})
