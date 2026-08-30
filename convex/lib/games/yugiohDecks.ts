import { objectRecord, stringValue } from "./cards"

export type YgoDeckFeedEntry = {
  providerCardId: string
  quantity: number
  section: "main" | "extra" | "side"
}

export type YgoDeckFeedItem = {
  externalId: string
  name: string
  kind: "community" | "tournament"
  sourceUrl: string
  entries: YgoDeckFeedEntry[]
}

const SOURCE_URL = "https://ygoprodeck.com/api/decks/getDecks.php"
function numericReferences(value: unknown) {
  if (typeof value !== "string") return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.flatMap((entry) => {
          const reference =
            typeof entry === "number" && Number.isSafeInteger(entry)
              ? String(entry)
              : typeof entry === "string"
                ? entry
                : undefined
          return reference !== undefined && /^\d{5,12}$/.test(reference) ? [reference] : []
        })
      : []
  } catch {
    return []
  }
}

function countedEntries(references: readonly string[], section: YgoDeckFeedEntry["section"]) {
  const counts = new Map<string, number>()
  for (const reference of references) counts.set(reference, (counts.get(reference) ?? 0) + 1)
  return [...counts].map(([providerCardId, quantity]) => ({ providerCardId, quantity, section }))
}

export function normalizeYgoDeckFeed(value: unknown): YgoDeckFeedItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    const deck = objectRecord(candidate)
    const externalIdValue = deck?.deckNum
    const externalId =
      typeof externalIdValue === "number" && Number.isFinite(externalIdValue)
        ? String(externalIdValue)
        : stringValue(externalIdValue)
    const name = stringValue(deck?.deck_name)?.trim()
    const main = numericReferences(deck?.main_deck)
    const extra = numericReferences(deck?.extra_deck)
    const side = numericReferences(deck?.side_deck)
    if (
      !externalId ||
      !/^\d+$/.test(externalId) ||
      !name ||
      name.length > 200 ||
      main.length < 40 ||
      main.length > 60 ||
      extra.length > 15 ||
      side.length > 15
    )
      return []

    return [
      {
        externalId,
        name,
        kind: stringValue(deck?.tournamentName) ? "tournament" : "community",
        sourceUrl: SOURCE_URL,
        entries: [
          ...countedEntries(main, "main"),
          ...countedEntries(extra, "extra"),
          ...countedEntries(side, "side"),
        ],
      } satisfies YgoDeckFeedItem,
    ]
  })
}

export const YGO_DECK_FEED_URL = SOURCE_URL
