import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import type { ActionCtx } from "./_generated/server"
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server"
import { preconstructedFormat } from "./lib/deckGames"
import { MAX_DECK_CARDS } from "./lib/policy"
import {
  type CardReference,
  fetchScryfall,
  normalizeScryfallCard,
  objectRecord,
} from "./lib/scryfall"

type DeckBoard = "main" | "sideboard" | "commander"

type ParsedEntry = {
  name: string
  quantity: number
  board: DeckBoard
  scryfallId?: string
}

export type ResolvedDeckCard = CardReference & {
  quantity: number
  board: DeckBoard
}

type PreconstructedDeck = {
  fileName: string
  name: string
  code?: string
  releaseDate?: string
  type?: string
}

type CachedPreconstructedCard = Pick<
  ResolvedDeckCard,
  "oracleId" | "scryfallId" | "name" | "imageUrl" | "smallImageUrl" | "quantity" | "board"
>

type ResolvedPreconstructedDeck = {
  name: string
  cards: CachedPreconstructedCard[]
  unresolved: string[]
}

type PreconstructedDeckOutline = {
  name: string
  cards: ParsedEntry[]
}

const MTGJSON_BASE_URL = "https://mtgjson.com/api/v5"
const MAX_PASTED_LIST_LENGTH = 50_000
const MAX_PRECON_RESULTS = 30
const MAX_PRECON_CATALOG = 4000
const PRECON_CATALOG_TTL_MS = 24 * 60 * 60 * 1000
const RESOLVED_PRECON_TTL_MS = 24 * 60 * 60 * 1000
const RESOLVED_PRECON_RETENTION_MS = 90 * 24 * 60 * 60 * 1000
const PRECON_REFRESH_LEASE_MS = 5 * 60 * 1000
const PRECON_COLD_FETCH_LEASE_MS = 15 * 1000
const PRECON_COLD_FETCH_POLL_MAX_MS = 500
const MAX_CACHE_PRUNE = 500
const SCRYFALL_COLLECTION_SIZE = 75

const preconDeckValidator = v.object({
  fileName: v.string(),
  name: v.string(),
  code: v.optional(v.string()),
  releaseDate: v.optional(v.string()),
  type: v.optional(v.string()),
})

const cachedPreconstructedCardValidator = v.object({
  oracleId: v.string(),
  scryfallId: v.string(),
  name: v.string(),
  imageUrl: v.optional(v.string()),
  smallImageUrl: v.optional(v.string()),
  quantity: v.number(),
  board: v.union(v.literal("main"), v.literal("sideboard"), v.literal("commander")),
})

const preconstructedOutlineCardValidator = v.object({
  name: v.string(),
  quantity: v.number(),
  board: v.union(v.literal("main"), v.literal("sideboard"), v.literal("commander")),
  scryfallId: v.optional(v.string()),
})

async function requireActionIdentity(ctx: { auth: { getUserIdentity: () => Promise<unknown> } }) {
  if (!(await ctx.auth.getUserIdentity()))
    throw new ConvexError({ code: "unauthenticated", message: "Authentication required" })
}

function sectionBoard(line: string): DeckBoard | "ignore" | undefined {
  const heading = line
    .replace(/[:\s]+$/g, "")
    .trim()
    .toLowerCase()
  if (["commander", "commanders"].includes(heading)) return "commander"
  if (["main", "mainboard", "deck"].includes(heading)) return "main"
  if (["side", "sideboard"].includes(heading)) return "sideboard"
  if (["maybeboard", "considering", "tokens"].includes(heading)) return "ignore"
  return undefined
}

function stripPrintingSuffix(name: string) {
  return name
    .replace(/\s+\([A-Z0-9]{2,8}\)(?:\s+[A-Za-z0-9-]+)?\s*$/i, "")
    .replace(/\s+\*[A-Z0-9-]+\*\s*$/i, "")
    .trim()
}

export function parsePastedDeckList(list: string) {
  if (list.length > MAX_PASTED_LIST_LENGTH)
    throw new ConvexError({ code: "deck_list_too_large", message: "Deck list is too large" })
  let board: DeckBoard | "ignore" = "main"
  const entries = new Map<string, ParsedEntry>()
  const invalidLines: string[] = []

  for (const sourceLine of list.split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith("#") || line.startsWith("//")) continue
    const nextBoard = sectionBoard(line)
    if (nextBoard) {
      board = nextBoard
      continue
    }
    if (board === "ignore") continue
    const match = line.match(/^(\d{1,3})\s*x?\s+(.+)$/i)
    const quantity = match ? Number(match[1]) : 0
    const name = match ? stripPrintingSuffix(match[2]) : ""
    if (!match || !name || quantity < 1 || quantity > 999) {
      invalidLines.push(sourceLine)
      continue
    }
    const key = `${board}:${name.toLocaleLowerCase()}`
    const current = entries.get(key)
    entries.set(key, {
      name,
      board,
      quantity: (current?.quantity ?? 0) + quantity,
    })
  }
  return { entries: [...entries.values()], invalidLines }
}

function preconFromValue(value: unknown): PreconstructedDeck | null {
  const deck = objectRecord(value)
  if (!deck || typeof deck.fileName !== "string" || typeof deck.name !== "string") return null
  return {
    fileName: deck.fileName,
    name: deck.name,
    ...(typeof deck.code === "string" ? { code: deck.code } : {}),
    ...(typeof deck.releaseDate === "string" ? { releaseDate: deck.releaseDate } : {}),
    ...(typeof deck.type === "string" ? { type: deck.type } : {}),
  }
}

function printingKey(entry: ParsedEntry) {
  return `${entry.board}:${entry.scryfallId ?? entry.name.toLocaleLowerCase()}`
}

function mtgJsonEntries(payload: unknown) {
  const envelope = objectRecord(payload)
  const deck = objectRecord(envelope?.data)
  if (!deck)
    throw new ConvexError({
      code: "precon_invalid_response",
      message: "The official deck service returned an invalid response",
    })
  const groups: Array<[DeckBoard, unknown]> = [
    ["commander", deck.commander],
    ["main", deck.mainBoard],
    ["sideboard", deck.sideBoard],
  ]
  const entries = new Map<string, ParsedEntry>()
  for (const [board, value] of groups) {
    if (!Array.isArray(value)) continue
    for (const item of value) {
      const card = objectRecord(item)
      const identifiers = objectRecord(card?.identifiers)
      if (!card || typeof card.name !== "string" || typeof card.count !== "number") continue
      const entry: ParsedEntry = {
        name: card.name,
        quantity: card.count,
        board,
        ...(typeof identifiers?.scryfallId === "string"
          ? { scryfallId: identifiers.scryfallId }
          : {}),
      }
      const key = printingKey(entry)
      const current = entries.get(key)
      entries.set(key, { ...entry, quantity: (current?.quantity ?? 0) + entry.quantity })
    }
  }
  return {
    name: typeof deck.name === "string" ? deck.name : "Imported deck",
    entries: [...entries.values()],
  }
}

async function resolveEntries(ctx: ActionCtx, entries: ParsedEntry[]) {
  if (entries.length === 0)
    throw new ConvexError({
      code: "empty_deck_list",
      message: "No cards were found in this deck list",
    })
  if (entries.length > MAX_DECK_CARDS)
    throw new ConvexError({
      code: "deck_too_large",
      message: `A deck may contain at most ${MAX_DECK_CARDS} entries`,
    })
  const resolved = new Map<string, CardReference>()
  const unresolved = new Set<string>()
  for (let offset = 0; offset < entries.length; offset += SCRYFALL_COLLECTION_SIZE) {
    const batch = entries.slice(offset, offset + SCRYFALL_COLLECTION_SIZE)
    const response = await fetchScryfall(ctx, "/cards/collection", {
      method: "POST",
      body: JSON.stringify({
        identifiers: batch.map((entry) =>
          entry.scryfallId ? { id: entry.scryfallId } : { name: entry.name },
        ),
      }),
    })
    if (!response.ok)
      throw new ConvexError({
        code: "scryfall_unavailable",
        message: `Card resolution is temporarily unavailable (${response.status})`,
      })
    const payload = objectRecord((await response.json()) as unknown)
    const cards = Array.isArray(payload?.data) ? payload.data : []
    for (const value of cards) {
      const card = normalizeScryfallCard(value)
      if (card) {
        resolved.set(`id:${card.scryfallId.toLowerCase()}`, card)
        resolved.set(`name:${card.name.toLocaleLowerCase()}`, card)
      }
    }
    const missing = Array.isArray(payload?.not_found) ? payload.not_found : []
    for (const value of missing) {
      const identifier = objectRecord(value)
      if (typeof identifier?.name === "string") unresolved.add(identifier.name)
      else if (typeof identifier?.id === "string") {
        const missingId = identifier.id
        const original = batch.find(
          (entry) => entry.scryfallId?.toLowerCase() === missingId.toLowerCase(),
        )
        unresolved.add(original?.name ?? missingId)
      }
    }
  }
  const cards: ResolvedDeckCard[] = []
  for (const entry of entries) {
    const card =
      (entry.scryfallId && resolved.get(`id:${entry.scryfallId.toLowerCase()}`)) ||
      resolved.get(`name:${entry.name.toLocaleLowerCase()}`)
    if (!card) {
      unresolved.add(entry.name)
      continue
    }
    cards.push({ ...card, quantity: entry.quantity, board: entry.board })
  }
  const unique = new Map<string, CardReference>()
  for (const card of resolved.values()) unique.set(card.scryfallId, card)
  if (unique.size > 0)
    await ctx.runMutation(internal.cards.cacheMany, { cards: [...unique.values()] })
  return { cards, unresolved: [...unresolved].sort() }
}

function cachedCard(card: ResolvedDeckCard): CachedPreconstructedCard {
  return {
    oracleId: card.oracleId,
    scryfallId: card.scryfallId,
    name: card.name,
    ...(card.imageUrl ? { imageUrl: card.imageUrl } : {}),
    ...(card.smallImageUrl ? { smallImageUrl: card.smallImageUrl } : {}),
    quantity: card.quantity,
    board: card.board,
  }
}

function cachedPreconstructedDeck(
  cached: Doc<"resolvedPreconstructedDecks">,
): ResolvedPreconstructedDeck {
  return { name: cached.name, cards: cached.cards, unresolved: cached.unresolved }
}

function outlineFromResolved(
  cached: Doc<"resolvedPreconstructedDecks">,
): PreconstructedDeckOutline {
  return {
    name: cached.name,
    cards: cached.cards.map(({ name, quantity, board, scryfallId }) => ({
      name,
      quantity,
      board,
      scryfallId,
    })),
  }
}

function outlineFromCache(cached: Doc<"preconstructedDeckOutlines">): PreconstructedDeckOutline {
  return { name: cached.name, cards: cached.cards }
}

export const resolvedPreconstructedCache = internalQuery({
  args: { fileName: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("resolvedPreconstructedDecks")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique(),
})

export const storeResolvedPreconstructed = internalMutation({
  args: {
    fileName: v.string(),
    name: v.string(),
    cards: v.array(cachedPreconstructedCardValidator),
    unresolved: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.cards.length + args.unresolved.length > MAX_DECK_CARDS)
      throw new ConvexError({
        code: "deck_too_large",
        message: `A deck may contain at most ${MAX_DECK_CARDS} entries`,
      })
    const existing = await ctx.db
      .query("resolvedPreconstructedDecks")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    const value = { ...args, fetchedAt: Date.now() }
    if (existing) {
      await ctx.db.replace(existing._id, value)
      return existing._id
    }
    return await ctx.db.insert("resolvedPreconstructedDecks", value)
  },
})

export const preconstructedOutlineCache = internalQuery({
  args: { fileName: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("preconstructedDeckOutlines")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique(),
})

export const storePreconstructedOutline = internalMutation({
  args: {
    fileName: v.string(),
    name: v.string(),
    cards: v.array(preconstructedOutlineCardValidator),
  },
  handler: async (ctx, args) => {
    if (args.cards.length > MAX_DECK_CARDS)
      throw new ConvexError({
        code: "deck_too_large",
        message: `A deck may contain at most ${MAX_DECK_CARDS} entries`,
      })
    const existing = await ctx.db
      .query("preconstructedDeckOutlines")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    const value = { ...args, fetchedAt: Date.now() }
    if (existing) {
      await ctx.db.replace(existing._id, value)
      return existing._id
    }
    return await ctx.db.insert("preconstructedDeckOutlines", value)
  },
})

export const claimResolvedPreconstructedRefresh = internalMutation({
  args: { fileName: v.string() },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("resolvedPreconstructedDecks")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    if (!cached || (cached.refreshingUntil ?? 0) > Date.now()) return false
    await ctx.db.patch(cached._id, { refreshingUntil: Date.now() + PRECON_REFRESH_LEASE_MS })
    return true
  },
})

export const releaseResolvedPreconstructedRefresh = internalMutation({
  args: { fileName: v.string() },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("resolvedPreconstructedDecks")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    if (cached) await ctx.db.patch(cached._id, { refreshingUntil: undefined })
    return null
  },
})

export const claimColdPreconstructedFetch = internalMutation({
  args: { fileName: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("resolvedPreconstructedDecks")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    if (cached) return false

    const existing = await ctx.db
      .query("preconstructedDeckFetches")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    const now = Date.now()
    if (existing && existing.leaseUntil > now) return false

    const value = {
      fileName: args.fileName,
      claimId: args.claimId,
      leaseUntil: now + PRECON_COLD_FETCH_LEASE_MS,
    }
    if (existing) await ctx.db.replace(existing._id, value)
    else await ctx.db.insert("preconstructedDeckFetches", value)
    return true
  },
})

export const coldPreconstructedFetchStatus = internalQuery({
  args: { fileName: v.string() },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("resolvedPreconstructedDecks")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    if (cached) return { cached, outline: null, leaseUntil: null }
    const outline = await ctx.db
      .query("preconstructedDeckOutlines")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    const fetch = await ctx.db
      .query("preconstructedDeckFetches")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    return { cached: null, outline, leaseUntil: fetch?.leaseUntil ?? null }
  },
})

export const releaseColdPreconstructedFetch = internalMutation({
  args: { fileName: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("preconstructedDeckFetches")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    if (existing?.claimId === args.claimId) await ctx.db.delete(existing._id)
    return null
  },
})

export const pruneResolvedPreconstructedCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("resolvedPreconstructedDecks")
      .withIndex("by_fetched_at", (query) =>
        query.lt("fetchedAt", Date.now() - RESOLVED_PRECON_RETENTION_MS),
      )
      .take(MAX_CACHE_PRUNE)
    for (const cached of expired) await ctx.db.delete(cached._id)
    const expiredOutlines = await ctx.db
      .query("preconstructedDeckOutlines")
      .withIndex("by_fetched_at", (query) =>
        query.lt("fetchedAt", Date.now() - RESOLVED_PRECON_RETENTION_MS),
      )
      .take(MAX_CACHE_PRUNE - expired.length)
    for (const outline of expiredOutlines) await ctx.db.delete(outline._id)
    return expired.length + expiredOutlines.length
  },
})

export const catalog = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("preconCatalogs").first(),
})

export const storeCatalog = internalMutation({
  args: { decks: v.array(preconDeckValidator) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("preconCatalogs").first()
    const value = { fetchedAt: Date.now(), decks: args.decks }
    if (existing) {
      await ctx.db.replace(existing._id, value)
      return null
    }
    await ctx.db.insert("preconCatalogs", value)
    return null
  },
})

async function fetchPreconCatalog() {
  const response = await fetch(`${MTGJSON_BASE_URL}/DeckList.json`)
  if (!response.ok)
    throw new ConvexError({
      code: "precon_search_unavailable",
      message: `Official deck search is temporarily unavailable (${response.status})`,
    })
  const envelope = objectRecord((await response.json()) as unknown)
  const data = Array.isArray(envelope?.data) ? envelope.data : []
  return data
    .map(preconFromValue)
    .filter((deck): deck is PreconstructedDeck => deck !== null)
    .slice(0, MAX_PRECON_CATALOG)
}

async function preconCatalog(ctx: ActionCtx) {
  const cached: Doc<"preconCatalogs"> | null = await ctx.runQuery(internal.deckImports.catalog, {})
  if (cached && Date.now() - cached.fetchedAt < PRECON_CATALOG_TTL_MS) return cached.decks
  try {
    const decks = await fetchPreconCatalog()
    await ctx.runMutation(internal.deckImports.storeCatalog, { decks })
    return decks
  } catch (cause) {
    if (cached) return cached.decks
    throw cause
  }
}

function normalizedPreconstructedFileName(fileName: string) {
  if (!/^[A-Za-z0-9_.-]{1,200}$/.test(fileName))
    throw new ConvexError({ code: "invalid_deck_identifier", message: "Invalid deck identifier" })
  return fileName.endsWith(".json") ? fileName : `${fileName}.json`
}

async function cachedPreconstructedOutline(
  ctx: ActionCtx,
  fileName: string,
): Promise<PreconstructedDeckOutline | null> {
  const resolved: Doc<"resolvedPreconstructedDecks"> | null = await ctx.runQuery(
    internal.deckImports.resolvedPreconstructedCache,
    { fileName },
  )
  if (resolved) return outlineFromResolved(resolved)
  const outline: Doc<"preconstructedDeckOutlines"> | null = await ctx.runQuery(
    internal.deckImports.preconstructedOutlineCache,
    { fileName },
  )
  return outline ? outlineFromCache(outline) : null
}

async function fetchAndCachePreconstructedOutline(
  ctx: ActionCtx,
  fileName: string,
  forceRefresh = false,
): Promise<PreconstructedDeckOutline> {
  if (!forceRefresh) {
    const cached = await cachedPreconstructedOutline(ctx, fileName)
    if (cached) return cached
  }
  const response = await fetch(`${MTGJSON_BASE_URL}/decks/${encodeURIComponent(fileName)}`)
  if (!response.ok)
    throw new ConvexError({
      code: "precon_import_unavailable",
      message: `Official deck import is temporarily unavailable (${response.status})`,
    })
  const deck = mtgJsonEntries((await response.json()) as unknown)
  const outline = { name: deck.name, cards: deck.entries }
  await ctx.runMutation(internal.deckImports.storePreconstructedOutline, {
    fileName,
    ...outline,
  })
  return outline
}

async function fetchAndCachePreconstructed(
  ctx: ActionCtx,
  fileName: string,
  refreshOutline = false,
): Promise<ResolvedPreconstructedDeck> {
  const deck = await fetchAndCachePreconstructedOutline(ctx, fileName, refreshOutline)
  const resolved = await resolveEntries(ctx, deck.cards)
  const result = {
    name: deck.name,
    cards: resolved.cards.map(cachedCard),
    unresolved: resolved.unresolved,
  }
  await ctx.runMutation(internal.deckImports.storeResolvedPreconstructed, {
    fileName,
    ...result,
  })
  return result
}

async function previewColdPreconstructed(
  ctx: ActionCtx,
  fileName: string,
): Promise<PreconstructedDeckOutline> {
  const claimId = crypto.randomUUID()
  let pollMs = 100

  while (true) {
    const claimed: boolean = await ctx.runMutation(
      internal.deckImports.claimColdPreconstructedFetch,
      { fileName, claimId },
    )
    if (claimed) {
      try {
        return await fetchAndCachePreconstructedOutline(ctx, fileName)
      } finally {
        await ctx.runMutation(internal.deckImports.releaseColdPreconstructedFetch, {
          fileName,
          claimId,
        })
      }
    }

    const status: {
      cached: Doc<"resolvedPreconstructedDecks"> | null
      outline: Doc<"preconstructedDeckOutlines"> | null
      leaseUntil: number | null
    } = await ctx.runQuery(internal.deckImports.coldPreconstructedFetchStatus, { fileName })
    if (status.cached) return outlineFromResolved(status.cached)
    if (status.outline) return outlineFromCache(status.outline)
    if (status.leaseUntil === null || status.leaseUntil <= Date.now()) continue

    await new Promise((resolve) => setTimeout(resolve, pollMs))
    pollMs = Math.min(pollMs * 2, PRECON_COLD_FETCH_POLL_MAX_MS)
  }
}

async function resolveColdPreconstructed(
  ctx: ActionCtx,
  fileName: string,
): Promise<ResolvedPreconstructedDeck> {
  const claimId = crypto.randomUUID()
  let pollMs = 100

  while (true) {
    const claimed: boolean = await ctx.runMutation(
      internal.deckImports.claimColdPreconstructedFetch,
      { fileName, claimId },
    )
    if (claimed) {
      try {
        return await fetchAndCachePreconstructed(ctx, fileName)
      } finally {
        await ctx.runMutation(internal.deckImports.releaseColdPreconstructedFetch, {
          fileName,
          claimId,
        })
      }
    }

    const status: {
      cached: Doc<"resolvedPreconstructedDecks"> | null
      outline: Doc<"preconstructedDeckOutlines"> | null
      leaseUntil: number | null
    } = await ctx.runQuery(internal.deckImports.coldPreconstructedFetchStatus, { fileName })
    if (status.cached) return cachedPreconstructedDeck(status.cached)
    if (status.leaseUntil === null || status.leaseUntil <= Date.now()) continue

    await new Promise((resolve) => setTimeout(resolve, pollMs))
    pollMs = Math.min(pollMs * 2, PRECON_COLD_FETCH_POLL_MAX_MS)
  }
}

export const refreshResolvedPreconstructed = internalAction({
  args: { fileName: v.string() },
  handler: async (ctx, args): Promise<null> => {
    try {
      await fetchAndCachePreconstructed(ctx, args.fileName, true)
    } finally {
      await ctx.runMutation(internal.deckImports.releaseResolvedPreconstructedRefresh, args)
    }
    return null
  },
})

export const searchPreconstructed = action({
  args: { query: v.string(), format: v.optional(v.string()) },
  handler: async (ctx, args): Promise<PreconstructedDeck[]> => {
    await requireActionIdentity(ctx)
    const query = args.query.trim().toLocaleLowerCase()
    const format = args.format?.trim().toLocaleLowerCase()
    if (query.length > 120) return []
    if (query.length < 2 && !format) return []
    const decks = await preconCatalog(ctx)
    return decks
      .filter((deck) => !format || preconstructedFormat(deck.type) === format)
      .filter(
        (deck) =>
          query.length < 2 ||
          [deck.name, deck.code, deck.type].some((value) =>
            value?.toLocaleLowerCase().includes(query),
          ),
      )
      .sort((left, right) => (right.releaseDate ?? "").localeCompare(left.releaseDate ?? ""))
      .slice(0, MAX_PRECON_RESULTS)
  },
})

export const previewPreconstructed = action({
  args: { fileName: v.string() },
  handler: async (ctx, args): Promise<PreconstructedDeckOutline> => {
    await requireActionIdentity(ctx)
    const fileName = normalizedPreconstructedFileName(args.fileName)
    const cached = await cachedPreconstructedOutline(ctx, fileName)
    return cached ?? (await previewColdPreconstructed(ctx, fileName))
  },
})

export const resolvePreconstructed = action({
  args: { fileName: v.string() },
  handler: async (ctx, args): Promise<ResolvedPreconstructedDeck> => {
    await requireActionIdentity(ctx)
    const fileName = normalizedPreconstructedFileName(args.fileName)
    const cached: Doc<"resolvedPreconstructedDecks"> | null = await ctx.runQuery(
      internal.deckImports.resolvedPreconstructedCache,
      { fileName },
    )
    if (cached && Date.now() - cached.fetchedAt < RESOLVED_PRECON_TTL_MS)
      return cachedPreconstructedDeck(cached)
    if (cached) {
      const claimed: boolean = await ctx.runMutation(
        internal.deckImports.claimResolvedPreconstructedRefresh,
        { fileName },
      )
      if (claimed)
        await ctx.scheduler.runAfter(0, internal.deckImports.refreshResolvedPreconstructed, {
          fileName,
        })
      return cachedPreconstructedDeck(cached)
    }
    return await resolveColdPreconstructed(ctx, fileName)
  },
})

export const resolvePasted = action({
  args: { list: v.string() },
  handler: async (ctx, args) => {
    await requireActionIdentity(ctx)
    const parsed = parsePastedDeckList(args.list)
    const resolved = await resolveEntries(ctx, parsed.entries)
    return { ...resolved, invalidLines: parsed.invalidLines }
  },
})
