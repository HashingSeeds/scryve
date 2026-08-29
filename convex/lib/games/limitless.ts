import { normalizeCardName, objectRecord, stringValue } from "./cards"

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

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined
}

function deckEntries(value: unknown, category: LimitlessDeckEntry["category"]) {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    const entry = objectRecord(candidate)
    const name = stringValue(entry?.name)?.trim()
    const set = stringValue(entry?.set)?.trim().toUpperCase()
    const collectorNumber = stringValue(entry?.number)?.trim()
    const quantity = integer(entry?.count)
    if (!name || !set || !collectorNumber || !quantity || quantity < 1 || quantity > 99) return []
    return [
      {
        name,
        quantity,
        category,
        collectorNumber,
        originalReference: `${set} ${collectorNumber}`,
      } satisfies LimitlessDeckEntry,
    ]
  })
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
        sourceUrl: `https://play.limitlesstcg.com/tournament/${tournamentId}/standings`,
        ...(date && Number.isFinite(Date.parse(date)) ? { publishedAt: Date.parse(date) } : {}),
        entries,
      } satisfies LimitlessDeck,
    ]
  })
}

export function pokemonSummaryLookupKey(name: string, collectorNumber: string) {
  return `${normalizeCardName(name)}:${collectorNumber.replace(/^0+/, "").toLocaleLowerCase()}`
}
