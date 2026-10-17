import { ConvexError, v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { internalMutation, internalQuery, query } from "./_generated/server"
import {
  MAX_CARD_FACES,
  MAX_CARD_FACETS,
  MAX_CATALOG_BATCH,
  MAX_DATASET_BATCH,
  normalizeCardName,
  type CatalogCard,
  type NormalizedCard,
} from "./lib/games/cards"
import { GAME_PROVIDERS, isProviderGame } from "./lib/games/providers"
import { assertGameSystem, integration, requireReleasedCapability } from "./lib/integrations"

const MAX_CARD_PRINTINGS = 100
const SWEEP_BATCH = 100
const MAX_SWEPT_PRINTINGS = 2 * MAX_CARD_PRINTINGS

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
  game: v.union(v.literal("mtg"), v.literal("ygo"), v.literal("pokemon"), v.literal("lorcana")),
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
  if (card.printings.length < 1)
    throw new ConvexError({ code: "invalid_card", message: "Card has no printings" })
  for (const printing of card.printings.slice(0, MAX_CARD_PRINTINGS)) {
    if (printing.faces.length < 1 || printing.faces.length > MAX_CARD_FACES)
      throw new ConvexError({ code: "invalid_card", message: "Card has too many faces" })
  }
}

async function upsertCard(ctx: MutationCtx, card: NormalizedCard, now = Date.now()) {
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
  const briefSearchResults =
    isProviderGame(card.game) && GAME_PROVIDERS[card.game].catalog.briefSearchResults === true
  const keepsFullCard =
    briefSearchResults && existing?.category !== undefined && card.category === undefined
  const category = keepsFullCard ? existing.category : card.category
  const logicalValue = {
    game: assertGameSystem(card.game),
    identityNamespace: card.identityNamespace,
    cardId: card.cardId,
    name: card.name.trim(),
    nameNormalized: normalizeCardName(card.name),
    ...(category ? { category } : {}),
    facets: keepsFullCard ? existing.facets : card.facets,
    updatedAt: now,
  }
  const gameCardId = existing?._id ?? (await ctx.db.insert("gameCards", logicalValue))
  if (existing) await ctx.db.replace(existing._id, logicalValue)

  for (const printing of card.printings.slice(0, MAX_CARD_PRINTINGS)) {
    const stored = await ctx.db
      .query("cardPrintings")
      .withIndex("by_game_and_printing_id", (query) =>
        query.eq("game", card.game).eq("printingId", printing.printingId),
      )
      .unique()
    if (briefSearchResults && stored?.typeLabel && !printing.typeLabel) continue
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
    for (const card of args.cards)
      if (!isProviderGame(card.game) || !GAME_PROVIDERS[card.game].catalog.bulk)
        await upsertCard(ctx, card)
    return null
  },
})

export const datasetSync = internalQuery({
  args: { game: v.string() },
  handler: async (ctx, { game }) =>
    await ctx.db
      .query("cardDatasetSyncs")
      .withIndex("by_game", (query) => query.eq("game", game))
      .unique(),
})

export const writeDatasetBatch = internalMutation({
  args: {
    game: v.string(),
    version: v.string(),
    storedVersion: v.optional(v.string()),
    offset: v.number(),
    cards: v.array(normalizedCardValidator.omit("game")),
  },
  handler: async (ctx, args) => {
    const game = assertGameSystem(args.game)
    if (args.cards.length > MAX_DATASET_BATCH)
      throw new ConvexError({ code: "catalog_batch_too_large", message: "Card batch is too large" })
    const state = await ctx.db
      .query("cardDatasetSyncs")
      .withIndex("by_game", (query) => query.eq("game", game))
      .unique()
    const pending = state?.pending
    const resume = pending?.version === args.version && args.offset === pending.nextIndex
    const restart = args.offset === 0 && state?.version === args.storedVersion
    if (!resume && !restart) return null
    const startedAt = resume ? pending.startedAt : Date.now()
    for (const card of args.cards) await upsertCard(ctx, { ...card, game }, startedAt)
    const nextIndex = args.offset + args.cards.length
    const value = {
      game,
      ...(state?.version === undefined ? {} : { version: state.version }),
      pending: { version: args.version, nextIndex, startedAt },
    }
    if (state) await ctx.db.replace(state._id, value)
    else await ctx.db.insert("cardDatasetSyncs", value)
    return nextIndex
  },
})

export const sweepDatasetBatch = internalMutation({
  args: {
    game: v.string(),
    version: v.string(),
    total: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const game = assertGameSystem(args.game)
    const state = await ctx.db
      .query("cardDatasetSyncs")
      .withIndex("by_game", (query) => query.eq("game", game))
      .unique()
    const pending = state?.pending
    if (
      !state ||
      pending?.version !== args.version ||
      pending.nextIndex < args.total ||
      (pending.sweepCursor ?? null) !== args.cursor
    )
      return null
    const cards = await ctx.db
      .query("gameCards")
      .withIndex("by_game_and_identity_namespace_and_card_id", (query) => query.eq("game", game))
      .paginate({ numItems: SWEEP_BATCH, cursor: args.cursor })
    for (const card of cards.page) {
      const cardRemoved = card.updatedAt !== pending.startedAt
      const printings = await ctx.db
        .query("cardPrintings")
        .withIndex("by_game_card_id", (query) => query.eq("gameCardId", card._id))
        .take(MAX_SWEPT_PRINTINGS)
      for (const printing of printings)
        if (cardRemoved || printing.updatedAt !== pending.startedAt)
          await ctx.db.delete(printing._id)
      if (cardRemoved) await ctx.db.delete(card._id)
    }
    if (cards.isDone) {
      await ctx.db.replace(state._id, { game, version: args.version })
      return { cursor: null }
    }
    await ctx.db.patch(state._id, { pending: { ...pending, sweepCursor: cards.continueCursor } })
    return { cursor: cards.continueCursor }
  },
})

async function projectedCard(
  ctx: QueryCtx,
  card: Doc<"gameCards">,
  matchedPrinting?: Doc<"cardPrintings">,
): Promise<CatalogCard> {
  const printing =
    matchedPrinting ??
    (await ctx.db
      .query("cardPrintings")
      .withIndex("by_game_card_id", (query) => query.eq("gameCardId", card._id))
      .first())
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
    const integrationNamespace = integration(args.game)?.identityNamespace
    if (!integrationNamespace) return null
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
    return card ? await projectedCard(ctx, card, printing ?? undefined) : null
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
