import { ConvexError } from "convex/values"

import { normalizeCardName, objectRecord, stringValue, type NormalizedCard } from "./cards"
import {
  FEED_REQUEST_TIMEOUT_MS,
  MAX_FEED_DECKS,
  type DeckFeed,
  type DeckLinkSource,
  type DeckListEntry,
} from "./decks"
import { pokemonCardSummaries } from "./pokemon"
import { internal } from "../../_generated/api"
import type { ActionCtx } from "../../_generated/server"
import { deckSourceUrl, fetchDeckSource, invalidSourceDeck } from "../deckSources"

const LIMITLESS_BASE_URL = "https://play.limitlesstcg.com/api"
const LIMITLESS_STANDINGS_MAX_BYTES = 8 * 1024 * 1024
const LIMITLESS_MAX_WAIT_MS = 5_000

export type LimitlessDeckEntry = {
  name: string
  quantity: number
  category: "pokemon" | "trainer" | "energy"
  originalReference: string
  collectorNumber: string
}

export type LimitlessDeck = {
  externalId: string
  name: string
  format: string
  sourceUrl: string
  publishedAt?: number
  entries: LimitlessDeckEntry[]
}

export function limitlessDecklistUrl(tournamentId: string, player: string) {
  return `https://play.limitlesstcg.com/tournament/${tournamentId}/player/${encodeURIComponent(player)}/decklist`
}

export function parseLimitlessExternalId(externalId: string) {
  const separator = externalId.indexOf(":")
  if (separator < 1 || separator === externalId.length - 1) return undefined
  return { tournamentId: externalId.slice(0, separator), player: externalId.slice(separator + 1) }
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined
}

function deckEntry(
  candidate: unknown,
  category: LimitlessDeckEntry["category"],
): LimitlessDeckEntry | undefined {
  const entry = objectRecord(candidate)
  const name = stringValue(entry?.name)?.trim()
  const set = stringValue(entry?.set)?.trim().toUpperCase()
  const collectorNumber = stringValue(entry?.number)?.trim()
  const quantity = integer(entry?.count)
  if (!name || !set || !collectorNumber || !quantity || quantity < 1 || quantity > 99)
    return undefined
  return {
    name,
    quantity,
    category,
    collectorNumber,
    originalReference: `${set} ${collectorNumber}`,
  }
}

function deckEntries(value: unknown, category: LimitlessDeckEntry["category"]) {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => deckEntry(candidate, category) ?? [])
}

export function normalizeLimitlessStandings(
  tournamentValue: unknown,
  standingsValue: unknown,
): LimitlessDeck[] {
  const tournament = objectRecord(tournamentValue)
  const tournamentId = stringValue(tournament?.id)
  const tournamentName = stringValue(tournament?.name)?.trim()
  const format = stringValue(tournament?.format)?.toLocaleLowerCase() ?? "standard"
  const date = stringValue(tournament?.date)
  if (!tournamentId || !tournamentName || !Array.isArray(standingsValue)) return []

  return standingsValue.slice(0, 16).flatMap((candidate) => {
    const standing = objectRecord(candidate)
    if (!standing) return []
    const player = stringValue(standing?.player)
    const placing = integer(standing?.placing)
    const decklist = objectRecord(standing?.decklist)
    if (!player || !placing || !decklist) return []
    const entries = [
      ...deckEntries(decklist.pokemon, "pokemon"),
      ...deckEntries(decklist.trainer, "trainer"),
      ...deckEntries(decklist.energy, "energy"),
    ]
    const total = entries.reduce((sum, entry) => sum + entry.quantity, 0)
    if (total < 40 || total > 100) return []
    const archetype = stringValue(objectRecord(standing.deck)?.name)?.trim()
    return [
      {
        externalId: `${tournamentId}:${player}`,
        name: archetype || `${tournamentName} #${placing}`,
        format: format === "expanded" ? "expanded" : "standard",
        sourceUrl: limitlessDecklistUrl(tournamentId, player),
        ...(date && Number.isFinite(Date.parse(date)) ? { publishedAt: Date.parse(date) } : {}),
        entries,
      } satisfies LimitlessDeck,
    ]
  })
}

export function pokemonSummaryLookupKey(name: string, collectorNumber: string) {
  return `${normalizeCardName(name)}:${collectorNumber.replace(/^0+/, "").toLocaleLowerCase()}`
}

export function limitlessDeckLink(input: string) {
  const message = "Enter a Limitless tournament decklist link."
  const url = deckSourceUrl(input, ["play.limitlesstcg.com"], message)
  const match = url.pathname.match(
    /^\/tournament\/([A-Za-z0-9_-]{8,64})\/player\/([^/]{1,64})(?:\/decklist)?\/?$/,
  )
  let player: string | undefined
  try {
    player = match ? decodeURIComponent(match[2]) : undefined
  } catch {
    player = undefined
  }
  if (!match || !player || !/^[\w.-]{1,64}$/.test(player))
    throw new ConvexError({ code: "invalid_deck_url", message })
  return {
    tournamentId: match[1],
    player,
    sourceUrl: limitlessDecklistUrl(match[1], player),
  }
}

export function limitlessPlayerDecklist(standingsValue: unknown, player: string) {
  if (!Array.isArray(standingsValue)) invalidSourceDeck("limitless")
  const standing = standingsValue
    .map(objectRecord)
    .find((candidate) => stringValue(candidate?.player)?.toLowerCase() === player.toLowerCase())
  if (!standing) invalidSourceDeck("limitless", "This player is not in that Limitless tournament.")
  const decklist = objectRecord(standing.decklist)
  const entries: LimitlessDeckEntry[] = []
  const invalidLines: string[] = []
  for (const category of ["pokemon", "trainer", "energy"] as const) {
    const rows = decklist?.[category]
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      const entry = deckEntry(row, category)
      if (entry) entries.push(entry)
      else invalidLines.push(stringValue(objectRecord(row)?.name)?.slice(0, 200) || "Unknown card")
    }
  }
  if (entries.length === 0)
    invalidSourceDeck("limitless", "This player has no public decklist on Limitless.")
  const author = stringValue(standing.name)?.trim().slice(0, 200) || player
  const archetype = stringValue(objectRecord(standing.deck)?.name)?.trim().slice(0, 200)
  return { name: archetype || `${author}'s deck`, author, entries, invalidLines }
}

function limitlessEntries(rows: readonly LimitlessDeckEntry[]) {
  const entries = new Map<string, DeckListEntry>()
  for (const row of rows) {
    const originalReference = `${row.name} ${row.originalReference}`
    const key = normalizeCardName(originalReference)
    const current = entries.get(key)
    entries.set(key, {
      name: row.name,
      quantity: (current?.quantity ?? 0) + row.quantity,
      section: "main",
      originalReference,
      sectionExplicit: true,
    })
  }
  return [...entries.values()]
}

export const LIMITLESS_LINK = {
  source: "limitless",
  sourceName: "Limitless",
  open: (url) => {
    const link = limitlessDeckLink(url)
    return {
      sourceUrl: link.sourceUrl,
      load: async () => {
        const body = await fetchDeckSource(
          "limitless",
          `${LIMITLESS_BASE_URL}/tournaments/${encodeURIComponent(link.tournamentId)}/standings`,
          { accept: "application/json", maxBytes: LIMITLESS_STANDINGS_MAX_BYTES },
        )
        let standings: unknown
        try {
          standings = JSON.parse(body)
        } catch {
          invalidSourceDeck("limitless")
        }
        const deck = limitlessPlayerDecklist(standings, link.player)
        return {
          name: deck.name,
          author: deck.author,
          entries: limitlessEntries(deck.entries),
          invalidLines: deck.invalidLines,
        }
      },
    }
  },
  throttle: async (ctx) => {
    const waitMs = await ctx.runMutation(internal.externalApiRateLimits.reserve, {
      bucket: "limitless:imports",
      intervalMs: 1_000,
      maxWaitMs: LIMITLESS_MAX_WAIT_MS,
    })
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
  },
} satisfies DeckLinkSource

async function limitlessJson(ctx: ActionCtx, path: string) {
  const waitMs = await ctx.runMutation(internal.externalApiRateLimits.reserve, {
    bucket: "limitless:tournaments",
    intervalMs: 6_000,
  })
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
  const response = await fetch(`${LIMITLESS_BASE_URL}${path}`, {
    headers: { "Accept": "application/json", "User-Agent": "Scryve/1.0" },
    signal: AbortSignal.timeout(FEED_REQUEST_TIMEOUT_MS),
  })
  if (!response.ok)
    throw Object.assign(new Error(`Limitless returned ${response.status}`), { response })
  return { value: (await response.json()) as unknown, status: response.status }
}

async function pokemonSummariesWhenAvailable(
  ctx: ActionCtx,
  references: readonly { name: string; collectorNumber: string }[],
  includeImages: boolean,
) {
  try {
    return (await pokemonCardSummaries(ctx, references, includeImages)).cards
  } catch {
    return []
  }
}

async function refreshPokemonTopDecks(
  ctx: ActionCtx,
  includeImages: boolean,
  format: string,
): Promise<{ count: number; status: number }> {
  let decks: LimitlessDeck[] = []
  const seenTournaments = new Set<string>()
  for (let page = 1; page <= 2 && decks.length < MAX_FEED_DECKS; page++) {
    const response = await limitlessJson(
      ctx,
      `/tournaments?game=PTCG&format=${encodeURIComponent(format.toUpperCase())}&limit=5&page=${page}`,
    )
    if (!Array.isArray(response.value))
      throw new Error("Limitless returned an invalid tournament list")
    for (const tournament of response.value.slice(0, 5)) {
      if (typeof tournament !== "object" || tournament === null || !("id" in tournament)) continue
      const id = tournament.id
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(id) || seenTournaments.has(id))
        continue
      seenTournaments.add(id)
      const standings = await limitlessJson(ctx, `/tournaments/${encodeURIComponent(id)}/standings`)
      if (!Array.isArray(standings.value)) throw new Error("Limitless returned invalid standings")
      decks.push(
        ...normalizeLimitlessStandings(tournament, standings.value).filter(
          (deck) => deck.format === format,
        ),
      )
      if (decks.length >= MAX_FEED_DECKS) break
    }
    if (response.value.length < 5) break
  }
  decks = decks.slice(0, MAX_FEED_DECKS)
  if (decks.length === 0) return { count: 0, status: 200 }

  const summaries = await pokemonSummariesWhenAvailable(
    ctx,
    decks.flatMap((deck) => deck.entries),
    includeImages,
  )
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
  return { count: decks.length, status: 200 }
}

export const LIMITLESS_FEED = {
  formats: ["standard", "expanded"],
  operation: (format) => `deck-feed-refresh:${format}`,
  refresh: refreshPokemonTopDecks,
  refreshMayCacheNothing: true,
} satisfies DeckFeed
