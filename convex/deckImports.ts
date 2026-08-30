import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import type { ActionCtx } from "./_generated/server"
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server"
import { actionCapabilityEnabled, requireActionCapability } from "./lib/actionCapabilities"
import { preconstructedFormat } from "./lib/deckGames"
import {
  MAX_CATALOG_BATCH,
  normalizeCardName,
  type CatalogCard,
  type NormalizedCard,
} from "./lib/games/cards"
import { searchPokemon } from "./lib/games/pokemon"
import { cardsByYgoIds, searchYgo, ygoSection } from "./lib/games/yugioh"
import { assertGameSystem, type GameSystemId } from "./lib/integrations"
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

type GenericParsedEntry = {
  name: string
  quantity: number
  section: string
  originalReference: string
  providerCardId?: string
  sectionExplicit: boolean
}

type GenericDeckCard = {
  game: Exclude<GameSystemId, "mtg">
  identityNamespace?: string
  cardId?: string
  providerCardId?: string
  printingId?: string
  section: string
  entryKind: string
  originalReference: string
  category?: string
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
}

function genericSection(line: string, game: GameSystemId) {
  const heading = line
    .replace(/[:\s]+$/g, "")
    .trim()
    .toLocaleLowerCase()
  if (game === "ygo") {
    if (["#main", "main", "main deck"].includes(heading)) return "main"
    if (["#extra", "extra", "extra deck"].includes(heading)) return "extra"
    if (["!side", "side", "side deck", "sideboard"].includes(heading)) return "side"
  }
  if (game === "pokemon" && ["pokémon", "pokemon", "trainer", "energy", "deck"].includes(heading))
    return "main"
  return undefined
}

function pokemonName(reference: string) {
  const match = reference.match(/^(.+?)\s+[A-Z0-9-]{2,8}\s+[A-Za-z0-9-]+$/)
  return (match?.[1] ?? reference).trim()
}

function decodeYdkeSection(encoded: string) {
  if (!encoded) return []
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
  } catch {
    throw new ConvexError({ code: "invalid_deck_list", message: "This YDKE link is invalid" })
  }
  if (bytes.byteLength % 4 !== 0)
    throw new ConvexError({ code: "invalid_deck_list", message: "This YDKE link is invalid" })
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Array.from({ length: bytes.byteLength / 4 }, (_, index) =>
    String(view.getUint32(index * 4, true)),
  )
}

function parseYdkeDeckList(list: string) {
  const payload = list.trim().slice("ydke://".length)
  const encodedSections = payload.split("!")
  if (encodedSections.length < 3 || encodedSections.length > 4)
    throw new ConvexError({ code: "invalid_deck_list", message: "This YDKE link is invalid" })
  const entries = new Map<string, GenericParsedEntry>()
  for (const [section, encoded] of ["main", "extra", "side"].map(
    (section, index) => [section, encodedSections[index]] as const,
  )) {
    for (const providerCardId of decodeYdkeSection(encoded)) {
      const key = `${section}:${providerCardId}`
      const current = entries.get(key)
      entries.set(key, {
        name: `Card ${providerCardId}`,
        quantity: (current?.quantity ?? 0) + 1,
        section,
        originalReference: providerCardId,
        providerCardId,
        sectionExplicit: true,
      })
    }
  }
  return { entries: [...entries.values()], invalidLines: [] }
}

export function parseGenericDeckList(list: string, game: Exclude<GameSystemId, "mtg">) {
  if (list.length > MAX_PASTED_LIST_LENGTH)
    throw new ConvexError({ code: "deck_list_too_large", message: "Deck list is too large" })
  if (game === "ygo" && list.trim().toLocaleLowerCase().startsWith("ydke://"))
    return parseYdkeDeckList(list)
  let section = "main"
  let sectionExplicit = false
  const entries = new Map<string, GenericParsedEntry>()
  const invalidLines: string[] = []
  for (const sourceLine of list.split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith("//") || line.startsWith("#created")) continue
    const nextSection = genericSection(line, game)
    if (nextSection) {
      section = nextSection
      sectionExplicit = true
      continue
    }
    if (game === "pokemon" && /^(pok[eé]mon|trainer|energy):\s*\d+$/i.test(line)) continue

    const ydkId = game === "ygo" ? line.match(/^\d{5,12}$/)?.[0] : undefined
    const quantityMatch = line.match(/^(\d{1,3})\s*x?\s+(.+)$/i)
    const quantity = ydkId ? 1 : quantityMatch ? Number(quantityMatch[1]) : 0
    const originalReference = ydkId ?? quantityMatch?.[2]?.trim() ?? ""
    if (!originalReference || quantity < 1 || quantity > 999) {
      invalidLines.push(sourceLine)
      continue
    }
    const providerCardId =
      game === "ygo" && /^\d{5,12}$/.test(originalReference) ? originalReference : undefined
    const name =
      providerCardId !== undefined
        ? `Card ${providerCardId}`
        : game === "pokemon"
          ? pokemonName(originalReference)
          : originalReference
    const key = `${section}:${providerCardId ?? name.toLocaleLowerCase()}`
    const current = entries.get(key)
    entries.set(key, {
      name,
      quantity: (current?.quantity ?? 0) + quantity,
      section,
      originalReference,
      ...(providerCardId ? { providerCardId } : {}),
      sectionExplicit,
    })
  }
  return { entries: [...entries.values()], invalidLines }
}

function genericDeckCard(
  game: Exclude<GameSystemId, "mtg">,
  card: NormalizedCard,
  entry: GenericParsedEntry,
): GenericDeckCard {
  const printing =
    card.printings.find((candidate) => candidate.printingId === entry.providerCardId) ??
    card.printings[0]
  const face = printing?.faces[0]
  const section = entry.sectionExplicit || card.game !== "ygo" ? entry.section : ygoSection(card)
  return {
    game,
    identityNamespace: card.identityNamespace,
    cardId: card.cardId,
    providerCardId: printing?.providerCardId,
    printingId: printing?.printingId,
    section,
    entryKind: "card",
    originalReference: entry.originalReference,
    ...(card.category ? { category: card.category } : {}),
    name: card.name,
    ...(face?.imageUrl ? { imageUrl: face.imageUrl } : {}),
    ...(face?.smallImageUrl ? { smallImageUrl: face.smallImageUrl } : {}),
    quantity: entry.quantity,
  }
}

function cachedGenericDeckCard(
  game: Exclude<GameSystemId, "mtg">,
  card: CatalogCard,
  entry: GenericParsedEntry,
): GenericDeckCard {
  return {
    game,
    identityNamespace: card.identityNamespace,
    cardId: card.cardId,
    providerCardId: card.providerCardId,
    printingId: card.printingId,
    section: entry.section,
    entryKind: "card",
    originalReference: entry.originalReference,
    ...(card.category ? { category: card.category } : {}),
    name: card.name,
    ...(card.imageUrl ? { imageUrl: card.imageUrl } : {}),
    ...(card.smallImageUrl ? { smallImageUrl: card.smallImageUrl } : {}),
    quantity: entry.quantity,
  }
}

function unresolvedDeckCard(game: Exclude<GameSystemId, "mtg">, entry: GenericParsedEntry) {
  return {
    game,
    section: entry.section,
    entryKind: "card",
    originalReference: entry.originalReference,
    name: entry.name,
    quantity: entry.quantity,
  }
}

function genericLookupKey(entry: GenericParsedEntry) {
  return entry.providerCardId
    ? `reference:${entry.providerCardId.toLocaleLowerCase()}`
    : `name:${normalizeCardName(entry.name)}`
}

async function resolveGenericEntries(
  ctx: ActionCtx,
  game: Exclude<GameSystemId, "mtg">,
  entries: GenericParsedEntry[],
): Promise<{ cards: GenericDeckCard[]; unresolved: string[] }> {
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

  const fetchedCards: NormalizedCard[] = []
  const includeImages = await actionCapabilityEnabled(ctx, game, "images")
  if (game === "ygo") {
    const ids = [
      ...new Set(entries.flatMap((entry) => (entry.providerCardId ? [entry.providerCardId] : []))),
    ]
    for (let offset = 0; offset < ids.length; offset += 40) {
      const result = await cardsByYgoIds(ctx, ids.slice(offset, offset + 40), includeImages)
      fetchedCards.push(...result.cards)
    }
  }
  const byIdentity = new Map<string, NormalizedCard>()
  for (const card of fetchedCards) {
    byIdentity.set(card.cardId, card)
    for (const printing of card.printings) byIdentity.set(printing.printingId, card)
  }

  type Resolution =
    { source: "provider"; card: NormalizedCard } | { source: "cache"; card: CatalogCard } | null
  const resolutions = new Map<string, Resolution>()
  for (const entry of entries) {
    const lookupKey = genericLookupKey(entry)
    if (resolutions.has(lookupKey)) continue

    const card = entry.providerCardId ? byIdentity.get(entry.providerCardId) : undefined
    if (card) {
      resolutions.set(lookupKey, { source: "provider", card })
      continue
    }

    const cached: CatalogCard[] = await ctx.runQuery(internal.cardCatalog.searchCached, {
      game,
      query: entry.name,
      limit: 5,
    })
    const exact = cached.find(
      (candidate) => normalizeCardName(candidate.name) === normalizeCardName(entry.name),
    )
    if (exact) {
      resolutions.set(lookupKey, { source: "cache", card: exact })
      continue
    }

    const result =
      game === "ygo"
        ? await searchYgo(ctx, entry.name, includeImages)
        : await searchPokemon(ctx, entry.name, includeImages)
    const resolved = result.cards.find(
      (candidate) => normalizeCardName(candidate.name) === normalizeCardName(entry.name),
    )
    if (result.cards.length > 0) fetchedCards.push(...result.cards)
    resolutions.set(lookupKey, resolved ? { source: "provider", card: resolved } : null)
  }

  const cards: GenericDeckCard[] = []
  const unresolved: string[] = []
  for (const entry of entries) {
    const resolution = resolutions.get(genericLookupKey(entry))
    if (resolution?.source === "provider") {
      cards.push(genericDeckCard(game, resolution.card, entry))
    } else if (resolution?.source === "cache") {
      cards.push(cachedGenericDeckCard(game, resolution.card, entry))
    } else {
      cards.push(unresolvedDeckCard(game, entry))
      unresolved.push(entry.originalReference)
    }
  }
  if (fetchedCards.length > 0) {
    const uniqueCards = [
      ...new Map(fetchedCards.map((card) => [`${card.game}:${card.cardId}`, card])).values(),
    ]
    for (let offset = 0; offset < uniqueCards.length; offset += MAX_CATALOG_BATCH) {
      await ctx.runMutation(internal.cardCatalog.cacheMany, {
        cards: uniqueCards.slice(offset, offset + MAX_CATALOG_BATCH),
      })
    }
  }
  return { cards, unresolved: unresolved.sort() }
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
      await ctx.db.replace(existing._id, { ...value, ...refreshLeaseOf(existing) })
      return existing._id
    }
    return await ctx.db.insert("resolvedPreconstructedDecks", value)
  },
})

function refreshLeaseOf(cached: Doc<"resolvedPreconstructedDecks">) {
  return {
    ...(cached.refreshingUntil === undefined ? {} : { refreshingUntil: cached.refreshingUntil }),
    ...(cached.refreshClaimId === undefined ? {} : { refreshClaimId: cached.refreshClaimId }),
  }
}

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
  args: { fileName: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("resolvedPreconstructedDecks")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    if (!cached || (cached.refreshingUntil ?? 0) > Date.now()) return false
    await ctx.db.patch(cached._id, {
      refreshingUntil: Date.now() + PRECON_REFRESH_LEASE_MS,
      refreshClaimId: args.claimId,
    })
    return true
  },
})

export const releaseResolvedPreconstructedRefresh = internalMutation({
  args: { fileName: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("resolvedPreconstructedDecks")
      .withIndex("by_file_name", (query) => query.eq("fileName", args.fileName))
      .unique()
    if (cached?.refreshClaimId === args.claimId)
      await ctx.db.patch(cached._id, { refreshingUntil: undefined, refreshClaimId: undefined })
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
  args: { fileName: v.string(), claimId: v.string() },
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
      const claimId = crypto.randomUUID()
      const claimed: boolean = await ctx.runMutation(
        internal.deckImports.claimResolvedPreconstructedRefresh,
        { fileName, claimId },
      )
      if (claimed)
        await ctx.scheduler.runAfter(0, internal.deckImports.refreshResolvedPreconstructed, {
          fileName,
          claimId,
        })
      return cachedPreconstructedDeck(cached)
    }
    return await resolveColdPreconstructed(ctx, fileName)
  },
})

export const resolvePasted = action({
  args: { list: v.string(), game: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { cards: ResolvedDeckCard[]; unresolved: string[]; invalidLines: string[] }
    | { cards: GenericDeckCard[]; unresolved: string[]; invalidLines: string[] }
  > => {
    await requireActionIdentity(ctx)
    const game = assertGameSystem(args.game ?? "mtg")
    await requireActionCapability(ctx, game, "deckImport")
    if (game !== "mtg") {
      const parsed = parseGenericDeckList(args.list, game)
      const startedAt = Date.now()
      try {
        const resolved: { cards: GenericDeckCard[]; unresolved: string[] } =
          await resolveGenericEntries(ctx, game, parsed.entries)
        const finishedAt = Date.now()
        await ctx.runMutation(internal.providerHealth.record, {
          game,
          provider: game === "ygo" ? "ygoprodeck" : "tcgdex",
          operation: "deck-resolution",
          status: resolved.unresolved.length > 0 ? "degraded" : "healthy",
          lastAttemptAt: finishedAt,
          ...(resolved.cards.length > resolved.unresolved.length
            ? { lastSuccessAt: finishedAt }
            : {}),
          responseMs: Math.max(0, finishedAt - startedAt),
          message: `${resolved.cards.length - resolved.unresolved.length} resolved, ${resolved.unresolved.length} unresolved`,
        })
        return { ...resolved, invalidLines: parsed.invalidLines }
      } catch (error) {
        const finishedAt = Date.now()
        await ctx.runMutation(internal.providerHealth.record, {
          game,
          provider: game === "ygo" ? "ygoprodeck" : "tcgdex",
          operation: "deck-resolution",
          status: "unavailable",
          lastAttemptAt: finishedAt,
          responseMs: Math.max(0, finishedAt - startedAt),
          message: error instanceof Error ? error.message : "Deck resolution failed",
        })
        throw error
      }
    }
    const parsed = parsePastedDeckList(args.list)
    const resolved = await resolveEntries(ctx, parsed.entries)
    return { ...resolved, invalidLines: parsed.invalidLines }
  },
})
