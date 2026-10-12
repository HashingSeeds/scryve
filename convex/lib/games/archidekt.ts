import { ConvexError } from "convex/values"

import type { ActionCtx } from "../../_generated/server"
import { boundedText, deckSourceUrl, fetchDeckSource, invalidSourceDeck } from "../deckSources"
import { MAX_DECK_CARDS } from "../policy"
import { type CardReference, fetchScryfall, normalizeScryfallCard, objectRecord } from "../scryfall"
import { hasCommandZone } from "../systems"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SCRYFALL_COLLECTION_SIZE = 75
const FORMATS = new Map([
  [1, "standard"],
  [2, "modern"],
  [3, "commander"],
  [4, "legacy"],
  [5, "vintage"],
  [6, "pauper"],
  [7, "constructed"],
  [13, "brawl"],
  [15, "pioneer"],
])
const EXCLUDED_CATEGORIES = [
  "Maybeboard",
  "Attraction",
  "Stickers",
  "Tokens & Extras",
  "Planar Deck",
]

export type ArchidektEntry = {
  name: string
  scryfallId: string
  oracleId: string
  quantity: number
  board: "main" | "sideboard" | "commander"
}

function invalidDeck(message?: string): never {
  invalidSourceDeck("archidekt", message)
}

export function archidektDeckLink(input: string) {
  const message = "Enter a public Archidekt deck link."
  const url = deckSourceUrl(input, ["archidekt.com", "www.archidekt.com"], message)
  const match = url.pathname.match(/^\/decks\/([1-9]\d{0,14})(?:\/[^/]*)?\/?$/)
  if (!match) throw new ConvexError({ code: "invalid_deck_url", message })
  return { deckId: match[1], sourceUrl: `https://archidekt.com/decks/${match[1]}` }
}

// eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Provider semantics are external and not apparent from the payload.
// Archidekt uses the first category for inclusion and board; remaining categories are tags.
export function parseArchidektDeck(payload: unknown, deckId: string) {
  const deck = objectRecord(payload)
  const owner = objectRecord(deck?.owner)
  if (
    !deck ||
    String(deck.id) !== deckId ||
    typeof deck.name !== "string" ||
    !deck.name.trim() ||
    deck.name.length > 500 ||
    typeof owner?.username !== "string" ||
    !owner.username.trim() ||
    owner.username.length > 200 ||
    deck.private !== false ||
    deck.unlisted !== false ||
    deck.intentionallySkippedCardData === true ||
    !Array.isArray(deck.cards) ||
    deck.cards.length > MAX_DECK_CARDS ||
    !Array.isArray(deck.categories) ||
    deck.categories.length > MAX_DECK_CARDS ||
    (deck.customCards !== undefined &&
      (!Array.isArray(deck.customCards) || deck.customCards.length > 0))
  )
    invalidDeck()
  const format = typeof deck.deckFormat === "number" ? FORMATS.get(deck.deckFormat) : undefined
  if (!format) invalidDeck("This Archidekt format is not supported. Try its text export instead.")
  const categories = new Map<string, { included: boolean; premier: boolean }>()
  for (const value of deck.categories) {
    const category = objectRecord(value)
    if (
      !category ||
      typeof category.name !== "string" ||
      category.name.length > 200 ||
      categories.has(category.name) ||
      typeof category.includedInDeck !== "boolean" ||
      typeof category.isPremier !== "boolean"
    )
      invalidDeck()
    categories.set(category.name, {
      included: category.includedInDeck,
      premier: category.isPremier,
    })
  }
  const entries = new Map<string, ArchidektEntry>()
  const rowIds = new Set<number>()
  for (const value of deck.cards) {
    const row = objectRecord(value)
    if (
      !row ||
      typeof row.id !== "number" ||
      !Number.isSafeInteger(row.id) ||
      rowIds.has(row.id) ||
      typeof row.quantity !== "number" ||
      !Number.isInteger(row.quantity) ||
      row.quantity < 1 ||
      row.quantity > 999 ||
      (row.categories !== null &&
        (!Array.isArray(row.categories) ||
          row.categories.length > MAX_DECK_CARDS ||
          !row.categories.every(
            (category) => typeof category === "string" && category.length <= 200,
          )))
    )
      invalidDeck()
    rowIds.add(row.id)
    if (row.deletedAt !== null && row.deletedAt !== undefined) invalidDeck()
    const primary = Array.isArray(row.categories) ? row.categories[0] : undefined
    const category = categories.get(primary) ?? {
      included: !EXCLUDED_CATEGORIES.includes(primary),
      premier: primary === "Commander",
    }
    if (!category.included) continue
    if (EXCLUDED_CATEGORIES.includes(primary)) invalidDeck()
    if (category.premier && primary !== "Commander") invalidDeck()
    const card = objectRecord(row.card)
    const oracle = objectRecord(card?.oracleCard)
    if (
      !card ||
      typeof card.uid !== "string" ||
      !UUID.test(card.uid) ||
      !oracle ||
      typeof oracle.uid !== "string" ||
      !UUID.test(oracle.uid) ||
      typeof oracle.name !== "string" ||
      !oracle.name.trim() ||
      oracle.name.length > 500 ||
      !Array.isArray(oracle.types) ||
      !oracle.types.every((type) => typeof type === "string")
    )
      invalidDeck()
    if (
      oracle.types.some((type) =>
        ["Token", "Emblem", "Plane", "Phenomenon", "Sticker"].includes(type),
      )
    )
      continue
    const board = category.premier ? "commander" : primary === "Sideboard" ? "sideboard" : "main"
    if (board === "commander" && !hasCommandZone("mtg", format)) invalidDeck()
    const key = `${board}:${card.uid.toLowerCase()}`
    const previous = entries.get(key)
    const quantity = (previous?.quantity ?? 0) + row.quantity
    if (quantity > 999 || (previous && previous.oracleId !== oracle.uid.toLowerCase()))
      invalidDeck()
    entries.set(key, {
      name: oracle.name,
      scryfallId: card.uid.toLowerCase(),
      oracleId: oracle.uid.toLowerCase(),
      board,
      quantity,
    })
  }
  if (entries.size === 0) invalidDeck("No importable cards were found in this Archidekt deck.")
  return { name: deck.name.trim(), format, author: owner.username, entries: [...entries.values()] }
}

function archidektJson(text: string) {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ConvexError({
      code: "archidekt_invalid_response",
      message: "Archidekt returned an invalid response.",
    })
  }
}

export async function loadArchidektDeck(link: ReturnType<typeof archidektDeckLink>) {
  const payload = archidektJson(
    await fetchDeckSource("archidekt", `https://archidekt.com/api/decks/${link.deckId}/`, {
      accept: "application/json",
    }),
  )
  return parseArchidektDeck(payload, link.deckId)
}

export async function resolveArchidektDeck(
  ctx: ActionCtx,
  link: ReturnType<typeof archidektDeckLink>,
  deck: ReturnType<typeof parseArchidektDeck>,
) {
  const { entries, ...metadata } = deck
  const resolved = new Map<string, CardReference>()
  const ids = [...new Set(entries.map((entry) => entry.scryfallId))]
  for (let offset = 0; offset < ids.length; offset += SCRYFALL_COLLECTION_SIZE) {
    const response = await fetchScryfall(ctx, "/cards/collection", {
      method: "POST",
      body: JSON.stringify({
        identifiers: ids.slice(offset, offset + SCRYFALL_COLLECTION_SIZE).map((id) => ({ id })),
      }),
    })
    if (!response.ok)
      throw new ConvexError({
        code: "scryfall_unavailable",
        message: "Card resolution is temporarily unavailable.",
      })
    const result = objectRecord(
      archidektJson(await boundedText(response, "archidekt_invalid_response")),
    )
    if (!Array.isArray(result?.data) || result.data.length > SCRYFALL_COLLECTION_SIZE)
      throw new ConvexError({
        code: "scryfall_unavailable",
        message: "Card resolution returned an invalid response.",
      })
    for (const value of result.data) {
      const card = normalizeScryfallCard(value)
      if (card) resolved.set(card.scryfallId.toLowerCase(), card)
    }
  }
  const cards: (CardReference & {
    quantity: number
    board: "main" | "sideboard" | "commander"
  })[] = []
  const unresolved: string[] = []
  for (const entry of entries) {
    const card = resolved.get(entry.scryfallId)
    if (!card || card.oracleId.toLowerCase() !== entry.oracleId) unresolved.push(entry.name)
    else cards.push({ ...card, quantity: entry.quantity, board: entry.board })
  }
  return { ...metadata, sourceUrl: link.sourceUrl, cards, unresolved, invalidLines: [] as string[] }
}
