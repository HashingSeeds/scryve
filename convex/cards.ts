import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import type { ActionCtx, MutationCtx } from "./_generated/server"
import { action, internalMutation, internalQuery } from "./_generated/server"
import { actionCapabilityEnabled, requireActionCapability } from "./lib/actionCapabilities"
import type { CatalogCard, NormalizedCard } from "./lib/games/cards"
import { normalizeScryfallCatalogCard } from "./lib/games/magic"
import { pokemonCardById, pokemonCardByReference, searchPokemon } from "./lib/games/pokemon"
import { cardsByYgoIds, searchYgo } from "./lib/games/yugioh"
import { assertGameSystem, type GameSystemId } from "./lib/integrations"
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

function catalogWithoutImages(card: CatalogCard): CatalogCard {
  const { imageUrl: _imageUrl, smallImageUrl: _smallImageUrl, ...cardWithoutImages } = card
  return {
    ...cardWithoutImages,
    faces: card.faces.map((face) => {
      const { imageUrl: _faceImage, smallImageUrl: _faceSmallImage, ...faceWithoutImages } = face
      return faceWithoutImages
    }),
  }
}

function catalogResult(card: NormalizedCard, includeImages = true): CatalogCard {
  const printing = card.printings[0]
  const face = printing?.faces[0]
  const result: CatalogCard = {
    game: card.game,
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
  return includeImages ? result : catalogWithoutImages(result)
}

function responseStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("response" in error)) return undefined
  const response = error.response
  return response instanceof Response ? response.status : undefined
}

async function recordHealth(
  ctx: ActionCtx,
  input: {
    game: GameSystemId
    provider: string
    operation: string
    startedAt: number
    status: "healthy" | "degraded" | "unavailable"
    httpStatus?: number
    message: string
  },
) {
  const finishedAt = Date.now()
  await ctx.runMutation(internal.providerHealth.record, {
    game: input.game,
    provider: input.provider,
    operation: input.operation,
    status: input.status,
    lastAttemptAt: finishedAt,
    ...(input.status === "healthy" ? { lastSuccessAt: finishedAt } : {}),
    responseMs: Math.max(0, finishedAt - input.startedAt),
    ...(input.httpStatus === undefined ? {} : { httpStatus: input.httpStatus }),
    message: input.message,
  })
}

export const search = action({
  args: { query: v.string(), game: v.optional(v.string()) },
  handler: async (ctx, args): Promise<CardReference[] | CatalogCard[]> => {
    await requireActionIdentity(ctx)
    const query = args.query.trim()
    if (query.length < 2 || query.length > 120) return []
    const game = assertGameSystem(args.game ?? "mtg")
    await requireActionCapability(ctx, game, "cardCatalog")
    const includeImages = await actionCapabilityEnabled(ctx, game, "images")
    if (game !== "mtg") {
      const cached: CatalogCard[] = await ctx.runQuery(internal.cardCatalog.searchCached, {
        game,
        query,
        limit: MAX_SEARCH_RESULTS,
      })
      if (cached.length > 0)
        return includeImages ? cached : cached.map((card) => catalogWithoutImages(card))
      const provider = game === "ygo" ? "ygoprodeck" : "tcgdex"
      const startedAt = Date.now()
      try {
        const result =
          game === "ygo"
            ? await searchYgo(ctx, query, includeImages)
            : await searchPokemon(ctx, query, includeImages)
        if (result.cards.length > 0)
          await ctx.runMutation(internal.cardCatalog.cacheMany, { cards: result.cards })
        await recordHealth(ctx, {
          game,
          provider,
          operation: "card-search",
          startedAt,
          status: "healthy",
          httpStatus: result.status,
          message: `${result.cards.length} cards normalized`,
        })
        return result.cards.map((card) => catalogResult(card, includeImages))
      } catch (error) {
        await recordHealth(ctx, {
          game,
          provider,
          operation: "card-search",
          startedAt,
          status: "unavailable",
          ...(responseStatus(error) === undefined ? {} : { httpStatus: responseStatus(error) }),
          message: error instanceof Error ? error.message : "Provider search failed",
        })
        throw new ConvexError({
          code: "card_provider_unavailable",
          message: "Card search is temporarily unavailable",
        })
      }
    }
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
    const catalogCards = data
      .map(normalizeScryfallCatalogCard)
      .filter((card): card is NormalizedCard => card !== null)
      .slice(0, MAX_SEARCH_RESULTS)
    if (catalogCards.length > 0)
      await ctx.runMutation(internal.cardCatalog.cacheMany, { cards: catalogCards })
    return cards
  },
})

export const byCatalogId = action({
  args: { game: v.string(), cardId: v.string() },
  handler: async (ctx, args): Promise<CatalogCard> => {
    await requireActionIdentity(ctx)
    const game = assertGameSystem(args.game)
    await requireActionCapability(ctx, game, "cardCatalog")
    const includeImages = await actionCapabilityEnabled(ctx, game, "images")
    const cardId = args.cardId.trim()
    if (!cardId || cardId.length > 200)
      throw new ConvexError({ code: "invalid_card_identifier", message: "Invalid card identifier" })
    const cached: CatalogCard | null = await ctx.runQuery(internal.cardCatalog.lookupCached, {
      game,
      cardId,
    })
    if (cached) return includeImages ? cached : catalogWithoutImages(cached)
    if (game === "mtg") {
      const response = await fetchScryfall(ctx, `/cards/${encodeURIComponent(cardId)}`)
      if (!response.ok)
        throw new ConvexError({ code: "scryfall_unavailable", message: "Card lookup failed" })
      const card = normalizeScryfallCatalogCard((await response.json()) as unknown)
      if (!card)
        throw new ConvexError({
          code: "scryfall_invalid_response",
          message: "Invalid card response",
        })
      await ctx.runMutation(internal.cardCatalog.cacheMany, { cards: [card] })
      return catalogResult(card, includeImages)
    }
    const provider = game === "ygo" ? "ygoprodeck" : "tcgdex"
    const startedAt = Date.now()
    try {
      const result =
        game === "ygo"
          ? await cardsByYgoIds(ctx, [cardId], includeImages)
          : await pokemonCardById(ctx, cardId, includeImages)
      const card = result.cards[0]
      if (!card) throw new ConvexError({ code: "card_not_found", message: "Card not found" })
      await ctx.runMutation(internal.cardCatalog.cacheMany, { cards: result.cards })
      await recordHealth(ctx, {
        game,
        provider,
        operation: "card-lookup",
        startedAt,
        status: "healthy",
        httpStatus: result.status,
        message: "Card normalized",
      })
      return catalogResult(card, includeImages)
    } catch (error) {
      await recordHealth(ctx, {
        game,
        provider,
        operation: "card-lookup",
        startedAt,
        status: "unavailable",
        ...(responseStatus(error) === undefined ? {} : { httpStatus: responseStatus(error) }),
        message: error instanceof Error ? error.message : "Provider lookup failed",
      })
      if (error instanceof ConvexError) throw error
      throw new ConvexError({
        code: "card_provider_unavailable",
        message: "Card lookup is temporarily unavailable",
      })
    }
  },
})

export const byPokemonReference = action({
  args: { name: v.string(), originalReference: v.string() },
  handler: async (ctx, args): Promise<CatalogCard> => {
    await requireActionIdentity(ctx)
    await requireActionCapability(ctx, "pokemon", "cardCatalog")
    const includeImages = await actionCapabilityEnabled(ctx, "pokemon", "images")
    const name = args.name.trim()
    const originalReference = args.originalReference.trim()
    if (!name || name.length > 200 || !originalReference || originalReference.length > 80)
      throw new ConvexError({ code: "invalid_card_identifier", message: "Invalid card reference" })

    const startedAt = Date.now()
    try {
      const result = await pokemonCardByReference(ctx, name, originalReference, includeImages)
      const card = result.cards[0]
      if (!card) throw new ConvexError({ code: "card_not_found", message: "Card not found" })
      await ctx.runMutation(internal.cardCatalog.cacheMany, { cards: result.cards })
      await recordHealth(ctx, {
        game: "pokemon",
        provider: "tcgdex",
        operation: "card-reference-lookup",
        startedAt,
        status: "healthy",
        httpStatus: result.status,
        message: "Card reference normalized",
      })
      return catalogResult(card, includeImages)
    } catch (error) {
      await recordHealth(ctx, {
        game: "pokemon",
        provider: "tcgdex",
        operation: "card-reference-lookup",
        startedAt,
        status: "unavailable",
        ...(responseStatus(error) === undefined ? {} : { httpStatus: responseStatus(error) }),
        message: error instanceof Error ? error.message : "Provider reference lookup failed",
      })
      if (error instanceof ConvexError) throw error
      throw new ConvexError({
        code: "card_provider_unavailable",
        message: "Card lookup is temporarily unavailable",
      })
    }
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
