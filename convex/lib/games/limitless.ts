import { ConvexError } from "convex/values"

import { normalizeCardName, objectRecord, stringValue } from "./cards"
import { deckSourceUrl, invalidSourceDeck } from "../deckSources"

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
