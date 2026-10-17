import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server"
import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server"
import { actionCapabilityEnabled, requireActionCapability } from "./lib/actionCapabilities"
import { assertDeckGameFormat, magicCatalogCardFields } from "./lib/deckGames"
import { deckRateLimiter } from "./lib/deckRateLimits"
import { MAX_CATALOG_BATCH } from "./lib/games/cards"
import curatedDecks from "./lib/games/curatedDecks.json"
import { limitlessDecklistUrl, parseLimitlessExternalId } from "./lib/games/limitless"
import magicExamples from "./lib/games/magicExamples.json"
import { GAME_PROVIDERS, isProviderGame } from "./lib/games/providers"
import {
  assertGameSystem,
  capabilityReleased,
  GAME_SYSTEM_IDS,
  integrationFor,
  requireReleasedCapability,
} from "./lib/integrations"
import { MAX_DECK_CARDS } from "./lib/policy"
import { SYSTEMS } from "./lib/systems"

const FEED_TTL_MS = 24 * 60 * 60 * 1000

function deckFeed(game: string) {
  if (!isProviderGame(game)) return undefined
  const feed = GAME_PROVIDERS[game].deckFeed
  return (
    feed && { ...feed, game, provider: integrationFor(game).capabilities.exampleDecks.provider }
  )
}

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

function catalogQuery(
  ctx: QueryCtx,
  args: { game: string; query: string; format?: string; kind?: string },
) {
  const term = args.query.trim()
  if (term) {
    return ctx.db.query("deckCatalogs").withSearchIndex("search_name_by_format", (search) => {
      let filtered = search.search("name", term).eq("game", args.game)
      if (args.format) filtered = filtered.eq("format", args.format)
      if (args.kind) filtered = filtered.eq("kind", args.kind)
      return filtered
    })
  }
  const rows =
    args.format && args.kind
      ? ctx.db
          .query("deckCatalogs")
          .withIndex("by_game_and_format_and_kind_and_fetched_at", (q) =>
            q.eq("game", args.game).eq("format", args.format).eq("kind", args.kind!),
          )
      : args.format
        ? ctx.db
            .query("deckCatalogs")
            .withIndex("by_game_and_format_and_fetched_at", (q) =>
              q.eq("game", args.game).eq("format", args.format),
            )
        : args.kind
          ? ctx.db
              .query("deckCatalogs")
              .withIndex("by_game_and_kind_and_fetched_at", (q) =>
                q.eq("game", args.game).eq("kind", args.kind!),
              )
          : ctx.db
              .query("deckCatalogs")
              .withIndex("by_game_and_fetched_at", (q) => q.eq("game", args.game))
  return rows.order("desc")
}

async function searchRows(
  ctx: QueryCtx,
  args: { game: string; query: string; format?: string; kind?: string },
) {
  const term = args.query.trim()
  if (term.length === 1 || term.length > 120) return []
  return await catalogQuery(ctx, args).take(30)
}

export const browseCached = internalQuery({
  args: {
    game: v.string(),
    format: v.string(),
    query: v.string(),
    source: v.optional(v.union(v.literal("examples"), v.literal("official"), v.literal("all"))),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const rows = catalogQuery(ctx, {
      ...args,
      ...(args.source === "official" ? { kind: "official" } : {}),
    })
    return await (
      args.source === "examples" ? rows.filter((q) => q.neq(q.field("kind"), "official")) : rows
    ).paginate(args.paginationOpts)
  },
})

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

export const backfillLimitlessSourceUrls = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("deckCatalogs")
      .withIndex("by_game_and_source_and_external_id", (q) =>
        q.eq("game", "pokemon").eq("source", "limitless"),
      )
      .paginate(args.paginationOpts)
    for (const row of page.page) {
      const id = parseLimitlessExternalId(row.externalId)
      if (!id) continue
      const sourceUrl = limitlessDecklistUrl(id.tournamentId, id.player)
      if (row.sourceUrl !== sourceUrl) await ctx.db.patch(row._id, { sourceUrl })
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.deckCatalogs.backfillLimitlessSourceUrls, {
        paginationOpts: { ...args.paginationOpts, cursor: page.continueCursor },
      })
    return null
  },
})

const exampleDecks = [
  ...magicExamples.map((deck) => ({
    game: "mtg",
    source: "mtgo-examples",
    externalId: deck.id,
    kind: "example",
    name: deck.name,
    format: deck.format,
    sourceUrl: deck.sourceUrl,
    publishedAt: Date.parse(deck.publishedAt),
    entries: deck.cards.map((card) => ({
      identityNamespace: "scryfall-oracle",
      cardId: card.oracleId,
      providerCardId: card.scryfallId,
      printingId: card.scryfallId,
      name: card.name,
      quantity: card.quantity,
      section: card.section,
      entryKind: "card",
      imageUrl: card.imageUrl,
      smallImageUrl: card.smallImageUrl,
    })),
  })),
  ...curatedDecks,
]

async function seedDecks(
  ctx: MutationCtx,
  args: { game: string; format?: string; overwrite?: boolean },
) {
  await requireReleasedCapability(ctx, args.game, "exampleDecks")
  for (const deck of exampleDecks.filter(
    (deck) => deck.game === args.game && (!args.format || deck.format === args.format),
  )) {
    const existing = await ctx.db
      .query("deckCatalogs")
      .withIndex("by_game_and_source_and_external_id", (q) =>
        q.eq("game", deck.game).eq("source", deck.source).eq("externalId", deck.externalId),
      )
      .unique()
    if (existing && !args.overwrite) continue
    await ctx.runMutation(internal.deckCatalogs.upsert, deck)
    const seeded = isProviderGame(deck.game) ? GAME_PROVIDERS[deck.game].catalog.seeded : undefined
    if (seeded?.format === deck.format) {
      for (let offset = 0; offset < seeded.cards.length; offset += MAX_CATALOG_BATCH)
        await ctx.runMutation(internal.cardCatalog.cacheMany, {
          cards: seeded.cards.slice(offset, offset + MAX_CATALOG_BATCH),
        })
    }
  }
  return null
}

export const seedCuratedDecks = internalMutation({
  args: { game: v.string(), format: v.optional(v.string()), overwrite: v.optional(v.boolean()) },
  handler: seedDecks,
})

export const seedMagicExamples = internalMutation({
  args: {},
  handler: async (ctx) => await seedDecks(ctx, { game: "mtg" }),
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
  args: { game: v.string(), format: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const latest = await catalogQuery(ctx, {
      game: assertGameSystem(args.game),
      format: args.format,
      query: "",
    }).first()
    const feed = deckFeed(args.game)
    if (feed?.refreshMayCacheNothing) {
      const refresh = await ctx.db
        .query("providerHealth")
        .withIndex("by_game_and_provider_and_operation", (q) =>
          q
            .eq("game", feed.game)
            .eq("provider", feed.provider)
            .eq("operation", feed.operation(args.format ?? feed.formats[0])),
        )
        .unique()
      if (refresh?.lastSuccessAt !== undefined && refresh.lastSuccessAt > (latest?.fetchedAt ?? 0))
        return { fetchedAt: refresh.lastSuccessAt }
    }
    return latest
  },
})

export const feedState = internalQuery({
  args: { game: v.string(), format: v.string() },
  handler: async (ctx, { game, format }) => {
    const feed = deckFeed(game)
    if (!feed) return null
    return await ctx.db
      .query("providerHealth")
      .withIndex("by_game_and_provider_and_operation", (q) =>
        q.eq("game", game).eq("provider", feed.provider).eq("operation", feed.operation(format)),
      )
      .unique()
  },
})

async function refreshFeed(ctx: ActionCtx, game: string, format: string) {
  assertDeckGameFormat(game, format)
  const feed = deckFeed(game)
  if (!feed?.formats.includes(format)) return false
  const health = await ctx.runQuery(internal.deckCatalogs.feedState, { game, format })
  const latest = await ctx.runQuery(internal.deckCatalogs.latestFetch, { game, format })
  const fetchedAt = health?.lastSuccessAt ?? latest?.fetchedAt
  if (fetchedAt !== undefined && Date.now() - fetchedAt < FEED_TTL_MS) return true
  const startedAt = Date.now()
  try {
    await requireActionCapability(ctx, feed.game, "exampleDecks")
    const includeImages = await actionCapabilityEnabled(ctx, feed.game, "images")
    const result = await feed.refresh(ctx, includeImages, format)
    const finishedAt = Date.now()
    await ctx.runMutation(internal.providerHealth.record, {
      game,
      provider: feed.provider,
      operation: feed.operation(format),
      status: "healthy",
      lastAttemptAt: finishedAt,
      lastSuccessAt: finishedAt,
      responseMs: finishedAt - startedAt,
      httpStatus: result.status,
      message: `${result.count} decks cached`,
    })
    return true
  } catch (error) {
    const finishedAt = Date.now()
    await ctx.runMutation(internal.providerHealth.record, {
      game,
      provider: feed.provider,
      operation: feed.operation(format),
      status: "unavailable",
      lastAttemptAt: finishedAt,
      responseMs: finishedAt - startedAt,
      message: error instanceof Error ? error.message : "Deck feed refresh failed",
    })
    return false
  }
}

export const refresh = internalAction({
  args: { game: v.string(), format: v.string() },
  handler: async (ctx, args) => await refreshFeed(ctx, args.game, args.format),
})

export const requestRefresh = internalMutation({
  args: { game: v.string(), format: v.string(), background: v.boolean() },
  handler: async (ctx, { game, format, background }) => {
    await requireReleasedCapability(ctx, game, "exampleDecks")
    const result = await deckRateLimiter.limit(ctx, "catalogRefresh", { key: `${game}:${format}` })
    if (result.ok && background)
      await ctx.scheduler.runAfter(0, internal.deckCatalogs.refresh, { game, format })
    return result
  },
})

type BrowseResult = {
  decks: Doc<"deckCatalogs">[]
  cursor: string | null
  status: "ready" | "unsupported" | "refreshing" | "rate_limited" | "unavailable"
  retryAfterMs?: number
}

async function browseDecks(
  ctx: ActionCtx,
  args: {
    game: string
    format?: string
    query: string
    cursor?: string
    source?: "examples" | "official" | "all"
  },
): Promise<BrowseResult> {
  const game = assertGameSystem(args.game)
  const format = assertDeckGameFormat(game, args.format ?? SYSTEMS[game].defaultFormat.play)
  const feed = deckFeed(game)
  await requireActionCapability(ctx, game, "exampleDecks")
  if (args.query.trim().length > 120) return { decks: [], cursor: null, status: "ready" }
  if (!feed || args.source)
    await ctx.runMutation(internal.deckCatalogs.seedCuratedDecks, { game, format })
  const readPage = async () => {
    const page = await ctx.runQuery(internal.deckCatalogs.browseCached, {
      game,
      format,
      query: args.query.trim(),
      source: args.source,
      paginationOpts: { numItems: 30, cursor: args.cursor ?? null },
    })
    return { decks: page.page, cursor: page.isDone ? null : page.continueCursor }
  }
  const cached = await readPage()
  if (args.source === "official") return { ...cached, status: "ready" }
  const supported = feed
    ? feed.formats.includes(format)
    : exampleDecks.some((deck) => deck.game === game && deck.format === format)
  if (!supported) return { ...cached, status: cached.decks.length ? "ready" : "unsupported" }
  if (!feed) return { ...cached, status: "ready" }
  const latest = await ctx.runQuery(internal.deckCatalogs.latestFetch, { game, format })
  const health = await ctx.runQuery(internal.deckCatalogs.feedState, { game, format })
  const fetchedAt = health?.lastSuccessAt ?? latest?.fetchedAt
  if (fetchedAt !== undefined && Date.now() - fetchedAt < FEED_TTL_MS)
    return { ...cached, status: health?.status === "unavailable" ? "unavailable" : "ready" }
  const background = fetchedAt !== undefined
  const result = await ctx.runMutation(internal.deckCatalogs.requestRefresh, {
    game,
    format,
    background,
  })
  if (!result.ok) {
    if (health?.status === "unavailable")
      return { ...cached, status: "unavailable", retryAfterMs: result.retryAfter }
    if (background) return { ...cached, status: "refreshing", retryAfterMs: result.retryAfter }
    return { ...cached, status: "rate_limited", retryAfterMs: result.retryAfter }
  }
  if (background)
    return { ...cached, status: health?.status === "unavailable" ? "unavailable" : "refreshing" }
  const refreshed = await refreshFeed(ctx, game, format)
  return { ...(await readPage()), status: refreshed ? "ready" : "unavailable" }
}

export const browse = action({
  args: {
    game: v.string(),
    format: v.optional(v.string()),
    query: v.string(),
    cursor: v.optional(v.string()),
    source: v.optional(v.union(v.literal("examples"), v.literal("official"), v.literal("all"))),
  },
  handler: browseDecks,
})

export const searchTopDecks = action({
  args: { game: v.string(), query: v.string(), format: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Doc<"deckCatalogs">[]> => {
    const result = await browseDecks(ctx, args)
    if (!result.decks.length && result.status === "unavailable")
      throw new ConvexError({
        code: "deck_provider_unavailable",
        message: "Top Decks are temporarily unavailable",
      })
    return args.format === undefined && args.game !== "pokemon"
      ? await ctx.runQuery(internal.deckCatalogs.searchCached, args)
      : result.decks
  },
})

export const refreshScheduled = internalAction({
  args: {},
  handler: async (ctx) => {
    if (await actionCapabilityEnabled(ctx, "mtg", "exampleDecks"))
      await ctx.runMutation(internal.deckCatalogs.seedMagicExamples, {})
    for (const game of GAME_SYSTEM_IDS.filter(isProviderGame)) {
      for (const format of GAME_PROVIDERS[game].deckFeed?.formats ?? []) {
        if (!(await actionCapabilityEnabled(ctx, game, "exampleDecks"))) continue
        const health = await ctx.runQuery(internal.deckCatalogs.feedState, { game, format })
        if (health?.lastSuccessAt && Date.now() - health.lastSuccessAt < FEED_TTL_MS) continue
        await ctx.runMutation(internal.deckCatalogs.requestRefresh, {
          game,
          format,
          background: true,
        })
      }
    }
    return null
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
      entries: entries.slice(0, MAX_DECK_CARDS).map((storedEntry) => {
        const entry = { ...storedEntry, ...magicCatalogCardFields(storedEntry) }
        if (includeImages) {
          const imageUrl = isProviderGame(deck.game)
            ? GAME_PROVIDERS[deck.game].catalog.imageUrl?.(entry)
            : undefined
          return imageUrl
            ? {
                ...entry,
                imageUrl: entry.imageUrl ?? imageUrl,
                smallImageUrl: entry.smallImageUrl ?? entry.imageUrl ?? imageUrl,
              }
            : entry
        }
        const { imageUrl: _imageUrl, smallImageUrl: _smallImageUrl, ...textEntry } = entry
        return { ...textEntry, imageUrl: undefined, smallImageUrl: undefined }
      }),
    }
  },
})
