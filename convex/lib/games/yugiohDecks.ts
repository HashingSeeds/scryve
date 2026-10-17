import { ConvexError } from "convex/values"

import { objectRecord, stringValue } from "./cards"
import {
  FEED_REQUEST_TIMEOUT_MS,
  MAX_FEED_DECKS,
  nameReference,
  type DeckFeed,
  type DeckLinkSource,
  type DeckListEntry,
  type DeckListRules,
} from "./decks"
import { cardsByYgoIdBatches, ygoSection } from "./yugioh"
import { internal } from "../../_generated/api"
import type { ActionCtx } from "../../_generated/server"
import { deckSourceUrl, fetchDeckSource, invalidSourceDeck } from "../deckSources"
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

function ydkCardId(reference: string) {
  return /^\d{1,10}$/.test(reference) && Number(reference) <= 0xffffffff
    ? String(Number(reference))
    : undefined
}

function passcodeEntries(sections: readonly (readonly [string, readonly string[]])[]) {
  const entries = new Map<string, DeckListEntry>()
  for (const [section, providerCardIds] of sections) {
    for (const providerCardId of providerCardIds) {
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
  return [...entries.values()]
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
  if (!list.trim().toLocaleLowerCase().startsWith("ydke://")) return undefined
  const payload = list.trim().slice("ydke://".length)
  const encodedSections = payload.split("!")
  if (encodedSections.length < 3 || encodedSections.length > 4)
    throw new ConvexError({ code: "invalid_deck_list", message: "This YDKE link is invalid" })
  return {
    entries: passcodeEntries(
      (["main", "extra", "side"] as const).map(
        (section, index) => [section, decodeYdkeSection(encodedSections[index])] as const,
      ),
    ),
    invalidLines: [],
  }
}

export const YDK_DECK_LIST = {
  sectionHeadings: {
    main: ["#main", "main", "main deck"],
    extra: ["#extra", "extra", "extra deck"],
    side: ["!side", "side", "side deck", "sideboard"],
  },
  shareCode: parseYdkeDeckList,
  skipsLine: (line) => line.startsWith("#"),
  bareCardId: ydkCardId,
  reference: (reference) => {
    const providerCardId = ydkCardId(reference)
    if (providerCardId)
      return { name: `Card ${providerCardId}`, providerCardId, key: providerCardId }
    return /^\d+$/.test(reference) ? undefined : nameReference(reference)
  },
  prefetch: (ctx, entries, includeImages) =>
    cardsByYgoIdBatches(
      ctx,
      [
        ...new Set(
          entries.flatMap((entry) => (entry.providerCardId ? [entry.providerCardId] : [])),
        ),
      ],
      includeImages,
    ),
  defaultSection: ygoSection,
} satisfies DeckListRules

export const YGOPRODECK_LINK = {
  source: "ygoprodeck",
  sourceName: "YGOPRODeck",
  open: (url) => {
    const link = ygoprodeckDeckLink(url)
    return {
      sourceUrl: link.sourceUrl,
      load: async () => {
        const page = parseYgoprodeckDeckPage(
          await fetchDeckSource("ygoprodeck", link.sourceUrl, { accept: "text/html" }),
          link.deckId,
        )
        return {
          name: page.name,
          entries: passcodeEntries(Object.entries(page.sections)),
          invalidLines: [],
        }
      },
    }
  },
} satisfies DeckLinkSource

async function refreshYgoTopDecks(
  ctx: ActionCtx,
  includeImages: boolean,
): Promise<{ count: number; status: number }> {
  const game = "ygo"
  const waitMs = await ctx.runMutation(internal.externalApiRateLimits.reserve, {
    bucket: "ygoprodeck:deck-feed",
    intervalMs: 1_000,
  })
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
  const response = await fetch(`${YGO_DECK_FEED_URL}?_sft_category=Tournament%20Meta%20Decks`, {
    headers: { "Accept": "application/json", "User-Agent": "Scryve/1.0" },
    signal: AbortSignal.timeout(FEED_REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Yu-Gi-Oh! deck feed returned ${response.status}`)
  const feed = normalizeYgoDeckFeed((await response.json()) as unknown).slice(0, MAX_FEED_DECKS)
  if (feed.length === 0) throw new Error("Yu-Gi-Oh! deck feed contained no usable decks")

  const ids = [
    ...new Set(feed.flatMap((deck) => deck.entries.map((entry) => entry.providerCardId))),
  ]
  const cards = await cardsByYgoIdBatches(ctx, ids, includeImages)
  for (let offset = 0; offset < cards.length; offset += 25) {
    await ctx.runMutation(internal.cardCatalog.cacheMany, {
      cards: cards.slice(offset, offset + 25),
    })
  }
  const byId = new Map<string, (typeof cards)[number]>()
  for (const card of cards) {
    byId.set(card.cardId, card)
    for (const printing of card.printings) byId.set(printing.printingId, card)
  }

  for (const deck of feed) {
    await ctx.runMutation(internal.deckCatalogs.upsert, {
      game,
      source: YGOPRODECK_FEED.source,
      externalId: deck.externalId,
      kind: deck.kind,
      name: deck.name,
      format: "advanced",
      sourceUrl: deck.sourceUrl,
      entries: deck.entries.map((entry) => {
        const card = byId.get(entry.providerCardId)
        const printing =
          card?.printings.find((candidate) => candidate.printingId === entry.providerCardId) ??
          card?.printings[0]
        const face = printing?.faces[0]
        return {
          ...(card
            ? {
                identityNamespace: card.identityNamespace,
                cardId: card.cardId,
                providerCardId: printing?.providerCardId ?? entry.providerCardId,
                printingId: printing?.printingId ?? entry.providerCardId,
                name: card.name,
                ...(card.category ? { category: card.category } : {}),
                ...(face?.imageUrl ? { imageUrl: face.imageUrl } : {}),
                ...(face?.smallImageUrl ? { smallImageUrl: face.smallImageUrl } : {}),
              }
            : {
                providerCardId: entry.providerCardId,
                name: `Card ${entry.providerCardId}`,
              }),
          quantity: entry.quantity,
          section: entry.section,
          entryKind: "card",
          originalReference: entry.providerCardId,
        }
      }),
    })
  }
  return { count: feed.length, status: response.status }
}

export const YGOPRODECK_FEED = {
  source: "ygoprodeck-decks",
  formats: ["advanced"],
  operation: () => "deck-feed-refresh",
  refresh: refreshYgoTopDecks,
} satisfies DeckFeed
