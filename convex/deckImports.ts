import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import type { ActionCtx } from "./_generated/server"
import { action, internalMutation, internalQuery } from "./_generated/server"
import { preconstructedFormat } from "./lib/deckGames"
import {
  type CardReference,
  normalizeScryfallCard,
  objectRecord,
  SCRYFALL_BASE_URL,
  SCRYFALL_HEADERS,
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

const MTGJSON_BASE_URL = "https://mtgjson.com/api/v5"
const MAX_PASTED_LIST_LENGTH = 50_000
const MAX_PRECON_RESULTS = 30
const MAX_PRECON_CATALOG = 4000
const PRECON_CATALOG_TTL_MS = 24 * 60 * 60 * 1000
const SCRYFALL_COLLECTION_SIZE = 75

const preconDeckValidator = v.object({
  fileName: v.string(),
  name: v.string(),
  code: v.optional(v.string()),
  releaseDate: v.optional(v.string()),
  type: v.optional(v.string()),
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
  const resolved = new Map<string, CardReference>()
  const unresolved = new Set<string>()
  for (let offset = 0; offset < entries.length; offset += SCRYFALL_COLLECTION_SIZE) {
    const batch = entries.slice(offset, offset + SCRYFALL_COLLECTION_SIZE)
    const response = await fetch(`${SCRYFALL_BASE_URL}/cards/collection`, {
      method: "POST",
      headers: { ...SCRYFALL_HEADERS, "Content-Type": "application/json" },
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

export const resolvePreconstructed = action({
  args: { fileName: v.string() },
  handler: async (ctx, args) => {
    await requireActionIdentity(ctx)
    if (!/^[A-Za-z0-9_.-]{1,200}$/.test(args.fileName))
      throw new ConvexError({ code: "invalid_deck_identifier", message: "Invalid deck identifier" })
    const fileName = args.fileName.endsWith(".json") ? args.fileName : `${args.fileName}.json`
    const response = await fetch(`${MTGJSON_BASE_URL}/decks/${encodeURIComponent(fileName)}`)
    if (!response.ok)
      throw new ConvexError({
        code: "precon_import_unavailable",
        message: `Official deck import is temporarily unavailable (${response.status})`,
      })
    const deck = mtgJsonEntries((await response.json()) as unknown)
    return { name: deck.name, ...(await resolveEntries(ctx, deck.entries)) }
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
