import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import type { ActionCtx, QueryCtx } from "./_generated/server"
import { action, internalMutation, internalQuery, query } from "./_generated/server"
import { actionCapabilityEnabled, requireActionCapability } from "./lib/actionCapabilities"
import { assertDeckGameFormat } from "./lib/deckGames"
import type { NormalizedCard } from "./lib/games/cards"
import {
  normalizeLimitlessStandings,
  pokemonSummaryLookupKey,
  type LimitlessDeck,
} from "./lib/games/limitless"
import { pokemonCardSummaries } from "./lib/games/pokemon"
import { cardsByYgoIds } from "./lib/games/yugioh"
import { normalizeYgoDeckFeed, YGO_DECK_FEED_URL } from "./lib/games/yugiohDecks"
import { assertGameSystem, capabilityReleased, requireReleasedCapability } from "./lib/integrations"
import { MAX_DECK_CARDS } from "./lib/policy"

const FEED_TTL_MS = 6 * 60 * 60 * 1000
const MAX_FEED_DECKS = 20
const LIMITLESS_BASE_URL = "https://play.limitlesstcg.com/api"
const PROVIDER_REQUEST_TIMEOUT_MS = 10_000

const entryValidator = v.object({
  identityNamespace: v.optional(v.string()),
  cardId: v.optional(v.string()),
  providerCardId: v.optional(v.string()),
  printingId: v.optional(v.string()),
  name: v.string(),
  quantity: v.number(),
  section: v.string(),
  entryKind: v.string(),
  originalReference: v.optional(v.string()),
  category: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  smallImageUrl: v.optional(v.string()),
})

async function searchRows(
  ctx: QueryCtx,
  args: { game: string; query: string; format?: string; kind?: string },
) {
  const term = args.query.trim()
  if (term.length === 1 || term.length > 120) return []
  let rows: Doc<"deckCatalogs">[]
  if (!term) {
    if (args.kind) {
      rows = await ctx.db
        .query("deckCatalogs")
        .withIndex("by_game_and_kind_and_fetched_at", (query) =>
          query.eq("game", args.game).eq("kind", args.kind!),
        )
        .order("desc")
        .take(30)
    } else {
      rows = await ctx.db
        .query("deckCatalogs")
        .withIndex("by_game_and_fetched_at", (query) => query.eq("game", args.game))
        .order("desc")
        .take(30)
    }
  } else if (args.kind) {
    rows = await ctx.db
      .query("deckCatalogs")
      .withSearchIndex("search_name", (search) =>
        search.search("name", term).eq("game", args.game).eq("kind", args.kind!),
      )
      .take(30)
  } else {
    rows = await ctx.db
      .query("deckCatalogs")
      .withSearchIndex("search_name", (search) => search.search("name", term).eq("game", args.game))
      .take(30)
  }
  return args.format ? rows.filter((row) => row.format === args.format) : rows
}

export const upsert = internalMutation({
  args: {
    game: v.string(),
    source: v.string(),
    externalId: v.string(),
    kind: v.string(),
    name: v.string(),
    format: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    entries: v.array(entryValidator),
  },
  handler: async (ctx, args) => {
    const game = assertGameSystem(args.game)
    await requireReleasedCapability(ctx, game, "exampleDecks")
    if (args.entries.length > MAX_DECK_CARDS)
      throw new ConvexError({ code: "deck_too_large", message: "Catalog deck is too large" })
    const existing = await ctx.db
      .query("deckCatalogs")
      .withIndex("by_game_and_source_and_external_id", (query) =>
        query.eq("game", game).eq("source", args.source).eq("externalId", args.externalId),
      )
      .unique()
    const fetchedAt = Date.now()
    const parent = {
      game,
      source: args.source,
      externalId: args.externalId,
      kind: args.kind,
      name: args.name,
      ...(args.format ? { format: args.format } : {}),
      ...(args.sourceUrl ? { sourceUrl: args.sourceUrl } : {}),
      ...(args.publishedAt === undefined ? {} : { publishedAt: args.publishedAt }),
      fetchedAt,
    }
    const catalogDeckId = existing?._id ?? (await ctx.db.insert("deckCatalogs", parent))
    if (existing) await ctx.db.replace(existing._id, parent)
    const storedEntries = await ctx.db
      .query("deckCatalogCards")
      .withIndex("by_catalog_deck_id", (query) => query.eq("catalogDeckId", catalogDeckId))
      .take(MAX_DECK_CARDS + 1)
    for (const entry of storedEntries) await ctx.db.delete(entry._id)
    for (const entry of args.entries)
      await ctx.db.insert("deckCatalogCards", { catalogDeckId, game, ...entry })
    return catalogDeckId
  },
})

export const search = query({
  args: {
    game: v.string(),
    query: v.string(),
    format: v.optional(v.string()),
    kind: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const game = assertGameSystem(args.game)
    await requireReleasedCapability(ctx, game, "exampleDecks")
    return await searchRows(ctx, {
      game,
      query: args.query,
      ...(args.format ? { format: assertDeckGameFormat(game, args.format) } : {}),
      ...(args.kind ? { kind: args.kind } : {}),
    })
  },
})

export const searchCached = internalQuery({
  args: {
    game: v.string(),
    query: v.string(),
    format: v.optional(v.string()),
    kind: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const game = assertGameSystem(args.game)
    return await searchRows(ctx, {
      game,
      query: args.query,
      ...(args.format ? { format: assertDeckGameFormat(game, args.format) } : {}),
      ...(args.kind ? { kind: args.kind } : {}),
    })
  },
})

export const latestFetch = internalQuery({
  args: { game: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("deckCatalogs")
      .withIndex("by_game_and_fetched_at", (query) => query.eq("game", assertGameSystem(args.game)))
      .order("desc")
      .first(),
})

async function limitlessJson(ctx: ActionCtx, path: string) {
  const waitMs = await ctx.runMutation(internal.externalApiRateLimits.reserve, {
    bucket: "limitless:tournaments",
    intervalMs: 6_000,
  })
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
  const response = await fetch(`${LIMITLESS_BASE_URL}${path}`, {
    headers: { "Accept": "application/json", "User-Agent": "Scryve/1.0" },
    signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
  })
  if (!response.ok)
    throw Object.assign(new Error(`Limitless returned ${response.status}`), { response })
  return { value: (await response.json()) as unknown, status: response.status }
}

async function pokemonSummariesWhenAvailable(ctx: ActionCtx, includeImages: boolean) {
  try {
    return (await pokemonCardSummaries(ctx, includeImages)).cards
  } catch {
    return []
  }
}

async function refreshPokemonTopDecks(
  ctx: ActionCtx,
  includeImages: boolean,
): Promise<{ count: number; status: number }> {
  const tournamentsResponse = await limitlessJson(
    ctx,
    "/tournaments?game=PTCG&format=STANDARD&limit=5",
  )
  const tournaments = Array.isArray(tournamentsResponse.value) ? tournamentsResponse.value : []
  let decks: LimitlessDeck[] = []
  for (const tournament of tournaments) {
    if (typeof tournament !== "object" || tournament === null || !("id" in tournament)) continue
    const id = tournament.id
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) continue
    const standings = await limitlessJson(ctx, `/tournaments/${encodeURIComponent(id)}/standings`)
    decks = normalizeLimitlessStandings(tournament, standings.value).slice(0, 12)
    if (decks.length > 0) break
  }
  if (decks.length === 0) throw new Error("Limitless returned no usable public deck lists")

  const summaries = await pokemonSummariesWhenAvailable(ctx, includeImages)
  const byNameAndNumber = new Map<string, NormalizedCard[]>()
  for (const card of summaries) {
    const collectorNumber = card.cardId.match(/-([0-9]+[a-z]?)$/i)?.[1]
    if (!collectorNumber) continue
    const key = pokemonSummaryLookupKey(card.name, collectorNumber)
    byNameAndNumber.set(key, [...(byNameAndNumber.get(key) ?? []), card])
  }
  const resolved = new Map<string, NormalizedCard>()
  for (const deck of decks) {
    for (const entry of deck.entries) {
      const candidates = byNameAndNumber.get(
        pokemonSummaryLookupKey(entry.name, entry.collectorNumber),
      )
      if (candidates?.length === 1) resolved.set(entry.originalReference, candidates[0])
    }
  }
  const resolvedCards = [...new Set(resolved.values())]
  for (let offset = 0; offset < resolvedCards.length; offset += 25) {
    await ctx.runMutation(internal.cardCatalog.cacheMany, {
      cards: resolvedCards.slice(offset, offset + 25),
    })
  }

  for (const deck of decks) {
    await ctx.runMutation(internal.deckCatalogs.upsert, {
      game: "pokemon",
      source: "limitless",
      externalId: deck.externalId,
      kind: "tournament",
      name: deck.name,
      format: deck.format,
      sourceUrl: deck.sourceUrl,
      ...(deck.publishedAt === undefined ? {} : { publishedAt: deck.publishedAt }),
      entries: deck.entries.map((entry) => {
        const card = resolved.get(entry.originalReference)
        const printing = card?.printings[0]
        const face = printing?.faces[0]
        return {
          ...(card
            ? {
                identityNamespace: card.identityNamespace,
                cardId: card.cardId,
                providerCardId: printing?.providerCardId,
                printingId: printing?.printingId,
                ...(face?.imageUrl ? { imageUrl: face.imageUrl } : {}),
                ...(face?.smallImageUrl ? { smallImageUrl: face.smallImageUrl } : {}),
              }
            : {}),
          name: card?.name ?? entry.name,
          quantity: entry.quantity,
          section: "main",
          entryKind: "card",
          originalReference: entry.originalReference,
          category: entry.category,
        }
      }),
    })
  }
  return { count: decks.length, status: tournamentsResponse.status }
}

export const searchTopDecks = action({
  args: { game: v.string(), query: v.string(), format: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Doc<"deckCatalogs">[]> => {
    if (!(await ctx.auth.getUserIdentity()))
      throw new ConvexError({ code: "unauthenticated", message: "Authentication required" })
    const game = assertGameSystem(args.game)
    const format = args.format ? assertDeckGameFormat(game, args.format) : undefined
    await requireActionCapability(ctx, game, "exampleDecks")
    const includeImages = await actionCapabilityEnabled(ctx, game, "images")
    if (game === "mtg")
      return await ctx.runQuery(internal.deckCatalogs.searchCached, {
        game,
        query: args.query,
        ...(format ? { format } : {}),
      })

    const cached: Doc<"deckCatalogs">[] = await ctx.runQuery(internal.deckCatalogs.searchCached, {
      game,
      query: args.query,
      ...(format ? { format } : {}),
    })
    const latest = await ctx.runQuery(internal.deckCatalogs.latestFetch, { game })
    if (latest && Date.now() - latest.fetchedAt < FEED_TTL_MS) return cached

    const startedAt = Date.now()
    if (game === "pokemon") {
      try {
        const result = await refreshPokemonTopDecks(ctx, includeImages)
        const finishedAt = Date.now()
        await ctx.runMutation(internal.providerHealth.record, {
          game,
          provider: "limitless",
          operation: "deck-feed-refresh",
          status: "healthy",
          lastAttemptAt: finishedAt,
          lastSuccessAt: finishedAt,
          responseMs: finishedAt - startedAt,
          httpStatus: result.status,
          message: `${result.count} cleaned decks cached`,
        })
        return await ctx.runQuery(internal.deckCatalogs.searchCached, {
          game,
          query: args.query,
          ...(format ? { format } : {}),
        })
      } catch (error) {
        const finishedAt = Date.now()
        await ctx.runMutation(internal.providerHealth.record, {
          game,
          provider: "limitless",
          operation: "deck-feed-refresh",
          status: "unavailable",
          lastAttemptAt: finishedAt,
          responseMs: finishedAt - startedAt,
          message: error instanceof Error ? error.message : "Deck feed refresh failed",
        })
        if (cached.length > 0) return cached
        throw new ConvexError({
          code: "deck_provider_unavailable",
          message: "Top Decks are temporarily unavailable",
        })
      }
    }

    try {
      const waitMs = await ctx.runMutation(internal.externalApiRateLimits.reserve, {
        bucket: "ygoprodeck:deck-feed",
        intervalMs: 1_000,
      })
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
      const response = await fetch(YGO_DECK_FEED_URL, {
        headers: { "Accept": "application/json", "User-Agent": "Scryve/1.0" },
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      })
      if (!response.ok) throw new Error(`Yu-Gi-Oh! deck feed returned ${response.status}`)
      const feed = normalizeYgoDeckFeed((await response.json()) as unknown).slice(0, MAX_FEED_DECKS)
      if (feed.length === 0) throw new Error("Yu-Gi-Oh! deck feed contained no usable decks")

      const ids = [
        ...new Set(feed.flatMap((deck) => deck.entries.map((entry) => entry.providerCardId))),
      ]
      const cards: NormalizedCard[] = []
      for (let offset = 0; offset < ids.length; offset += 40) {
        const result = await cardsByYgoIds(ctx, ids.slice(offset, offset + 40), includeImages)
        cards.push(...result.cards)
      }
      for (let offset = 0; offset < cards.length; offset += 25) {
        await ctx.runMutation(internal.cardCatalog.cacheMany, {
          cards: cards.slice(offset, offset + 25),
        })
      }
      const byId = new Map<string, (typeof cards)[number]>()
      for (const card of cards) {
        byId.set(card.cardId, card)
        for (const printing of card.printings) byId.set(printing.printingId, card)
      }

      for (const deck of feed) {
        await ctx.runMutation(internal.deckCatalogs.upsert, {
          game,
          source: "ygoprodeck-decks",
          externalId: deck.externalId,
          kind: deck.kind,
          name: deck.name,
          format: "advanced",
          sourceUrl: deck.sourceUrl,
          entries: deck.entries.map((entry) => {
            const card = byId.get(entry.providerCardId)
            const printing =
              card?.printings.find((candidate) => candidate.printingId === entry.providerCardId) ??
              card?.printings[0]
            const face = printing?.faces[0]
            return {
              ...(card
                ? {
                    identityNamespace: card.identityNamespace,
                    cardId: card.cardId,
                    providerCardId: printing?.providerCardId ?? entry.providerCardId,
                    printingId: printing?.printingId ?? entry.providerCardId,
                    name: card.name,
                    ...(card.category ? { category: card.category } : {}),
                    ...(face?.imageUrl ? { imageUrl: face.imageUrl } : {}),
                    ...(face?.smallImageUrl ? { smallImageUrl: face.smallImageUrl } : {}),
                  }
                : {
                    providerCardId: entry.providerCardId,
                    name: `Card ${entry.providerCardId}`,
                  }),
              quantity: entry.quantity,
              section: entry.section,
              entryKind: "card",
              originalReference: entry.providerCardId,
            }
          }),
        })
      }

      const finishedAt = Date.now()
      await ctx.runMutation(internal.providerHealth.record, {
        game,
        provider: "ygoprodeck-decks",
        operation: "deck-feed-refresh",
        status: "healthy",
        lastAttemptAt: finishedAt,
        lastSuccessAt: finishedAt,
        responseMs: finishedAt - startedAt,
        httpStatus: response.status,
        message: `${feed.length} cleaned decks cached`,
      })
      return await ctx.runQuery(internal.deckCatalogs.searchCached, {
        game,
        query: args.query,
        ...(format ? { format } : {}),
      })
    } catch (error) {
      const finishedAt = Date.now()
      await ctx.runMutation(internal.providerHealth.record, {
        game,
        provider: "ygoprodeck-decks",
        operation: "deck-feed-refresh",
        status: "unavailable",
        lastAttemptAt: finishedAt,
        responseMs: finishedAt - startedAt,
        message: error instanceof Error ? error.message : "Deck feed refresh failed",
      })
      if (cached.length > 0) return cached
      throw new ConvexError({
        code: "deck_provider_unavailable",
        message: "Top Decks are temporarily unavailable",
      })
    }
  },
})

export const detail = query({
  args: { catalogDeckId: v.id("deckCatalogs") },
  handler: async (ctx, args) => {
    const deck = await ctx.db.get(args.catalogDeckId)
    if (!deck)
      throw new ConvexError({ code: "catalog_deck_not_found", message: "Catalog deck not found" })
    await requireReleasedCapability(ctx, deck.game, "exampleDecks")
    const entries = await ctx.db
      .query("deckCatalogCards")
      .withIndex("by_catalog_deck_id", (query) => query.eq("catalogDeckId", deck._id))
      .take(MAX_DECK_CARDS + 1)
    const includeImages = await capabilityReleased(ctx, deck.game, "images")
    return {
      deck,
      entries: entries.slice(0, MAX_DECK_CARDS).map((entry) => {
        if (includeImages) return entry
        const { imageUrl: _imageUrl, smallImageUrl: _smallImageUrl, ...textEntry } = entry
        return { ...textEntry, imageUrl: undefined, smallImageUrl: undefined }
      }),
    }
  },
})
