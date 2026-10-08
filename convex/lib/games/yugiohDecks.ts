import { ConvexError } from "convex/values"

import { objectRecord, stringValue } from "./cards"
import { deckSourceUrl, invalidSourceDeck } from "../deckSources"
import { MAX_DECK_CARDS } from "../policy"

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
        sourceUrl: `https://ygoprodeck.com/deck/${encodeURIComponent(stringValue(deck?.pretty_url) ?? externalId)}`,

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

export function ygoprodeckDeckLink(input: string) {
  const message = "Enter a public YGOPRODeck deck link."
  const url = deckSourceUrl(input, ["ygoprodeck.com", "www.ygoprodeck.com"], message)
  const match = url.pathname.match(/^\/deck\/(?:[^/]*-)?([1-9]\d{0,9})\/?$/)
  if (!match) throw new ConvexError({ code: "invalid_deck_url", message })
  return { deckId: match[1], sourceUrl: `https://ygoprodeck.com/deck/${match[1]}` }
}

export type YgoprodeckDeckPage = {
  name: string
  sections: Record<YgoDeckFeedEntry["section"], string[]>
}

function embeddedPasscodes(html: string, section: YgoDeckFeedEntry["section"]) {
  const raw = html.match(new RegExp(`var ${section}deckjs = '(\\[[^']*\\])'`))?.[1]
  if (raw === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    invalidSourceDeck("ygoprodeck")
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > MAX_DECK_CARDS ||
    !parsed.every(
      (id) => typeof id === "string" && /^\d{1,10}$/.test(id) && Number(id) <= 0xffffffff,
    )
  )
    invalidSourceDeck("ygoprodeck")
  return parsed.map((id: string) => String(Number(id)))
}

function embeddedDeckName(html: string) {
  const raw = html.match(/var deckname = "((?:[^"\\\n]|\\.)*)"/)?.[1]
  if (raw === undefined) return undefined
  try {
    const name: unknown = JSON.parse(`"${raw}"`)
    return typeof name === "string" && name.trim() ? name.trim().slice(0, 200) : undefined
  } catch {
    return undefined
  }
}

// eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Provider semantics are external and not apparent from the payload.
// YGOPRODeck has no deck API; its deck pages embed passcode arrays (`var maindeckjs = '[...]'`).
export function parseYgoprodeckDeckPage(html: string, deckId: string): YgoprodeckDeckPage {
  if (html.match(/var deckid = '(\d+)'/)?.[1] !== deckId) invalidSourceDeck("ygoprodeck")
  const main = embeddedPasscodes(html, "main")
  if (!main?.length)
    invalidSourceDeck("ygoprodeck", "No importable cards were found in this YGOPRODeck deck.")
  const sections = {
    main,
    extra: embeddedPasscodes(html, "extra") ?? [],
    side: embeddedPasscodes(html, "side") ?? [],
  }
  if (main.length + sections.extra.length + sections.side.length > MAX_DECK_CARDS)
    invalidSourceDeck("ygoprodeck")
  return { name: embeddedDeckName(html) ?? `YGOPRODeck deck ${deckId}`, sections }
}
