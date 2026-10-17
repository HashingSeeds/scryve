import { strFromU8, unzipSync } from "fflate"

import {
  compact,
  facet,
  fetchDatasetJson,
  finiteNumber,
  httpsUrl,
  normalizeCardName,
  objectRecord,
  stringList,
  stringValue,
  type BulkDataset,
  type CatalogCard,
  type DatasetCard,
} from "./cards"
import { FEED_REQUEST_TIMEOUT_MS, type DeckFeed, type DeckListRules } from "./decks"
import { internal } from "../../_generated/api"
import type { ActionCtx } from "../../_generated/server"

const LORCANA_JSON_URL = "https://lorcanajson.org/files/current/en"
export const LORCANA_JSON_NAMESPACE = "lorcanajson-card"

function lorcanaLegality(value: unknown) {
  const rule = objectRecord(value)
  if (!rule) return undefined
  if (rule.allowed === true) return "legal"
  return stringValue(rule.bannedSinceDate) ? "banned" : "not-legal"
}

function lorcanaPrinting(card: Record<string, unknown>, id: number) {
  const name = stringValue(card.fullName)
  const type = stringValue(card.type)
  const subtypes = stringValue(card.subtypesText)
  const number = finiteNumber(card.number)
  const images = objectRecord(card.images)
  return {
    provider: "lorcanajson",
    providerCardId: String(id),
    printingId: String(id),
    setCode: stringValue(card.setCode),
    collectorNumber:
      number === undefined ? undefined : `${number}${stringValue(card.variant) ?? ""}`,
    rarity: stringValue(card.rarity),
    typeLabel: type && subtypes ? `${type} - ${subtypes}` : type,
    costLabel: finiteNumber(card.cost)?.toString(),
    faces: [
      {
        index: 0,
        name,
        text: stringValue(card.fullText),
        imageUrl: httpsUrl(images?.full),
        smallImageUrl: httpsUrl(images?.thumbnail),
      },
    ],
  }
}

export function normalizeLorcanaJsonCards(value: unknown): DatasetCard[] {
  const cards = objectRecord(value)?.cards
  const groups = new Map<
    string,
    Array<{ id: number; name: string; card: Record<string, unknown> }>
  >()
  for (const candidate of Array.isArray(cards) ? cards : []) {
    const card = objectRecord(candidate)
    const id = finiteNumber(card?.id)
    const name = stringValue(card?.fullName)?.trim()
    if (!card || id === undefined || !name) continue
    const group = groups.get(normalizeCardName(name)) ?? []
    group.push({ id, name, card })
    groups.set(normalizeCardName(name), group)
  }
  return [...groups.values()].map((printings) => {
    printings.sort((a, b) => a.id - b.id)
    const { id, name, card } = printings[0]
    const formats = objectRecord(card.allowedInFormats)
    const inkwell = card.inkwell
    return {
      identityNamespace: LORCANA_JSON_NAMESPACE,
      cardId: String(id),
      name,
      nameNormalized: normalizeCardName(name),
      category: stringValue(card.type),
      facets: compact([
        facet("cost", card.cost),
        facet("inkwell", typeof inkwell === "boolean" ? String(inkwell) : undefined),
        facet("color", card.color),
        facet("strength", card.strength),
        facet("willpower", card.willpower),
        facet("lore", card.lore),
        facet("moveCost", card.moveCost),
        facet("subtypes", card.subtypesText),
        facet("keywords", stringList(card.keywordAbilities).join(", ")),
        facet("maxCopies", card.maxCopiesInDeck),
        facet("legality:core", lorcanaLegality(formats?.Core)),
        facet("legality:infinity", lorcanaLegality(formats?.Infinity)),
        facet("legalUntil:core", objectRecord(formats?.Core)?.allowedUntilDate),
      ]),
      printings: printings.map((printing) => lorcanaPrinting(printing.card, printing.id)),
    }
  })
}

export const LORCANA_JSON_DATASET = {
  version: async () => {
    const metadata = objectRecord(await fetchDatasetJson(`${LORCANA_JSON_URL}/metadata.json`))
    const generatedOn = stringValue(metadata?.generatedOn)
    if (!generatedOn) throw new Error("LorcanaJSON metadata has no generatedOn")
    return generatedOn
  },
  load: async (version) => {
    const allCards = await fetchDatasetJson(`${LORCANA_JSON_URL}/allCards.json`)
    const generatedOn = stringValue(objectRecord(objectRecord(allCards)?.metadata)?.generatedOn)
    if (generatedOn !== version)
      throw new Error(`LorcanaJSON allCards is ${generatedOn ?? "unversioned"}, not ${version}`)
    return normalizeLorcanaJsonCards(allCards)
  },
} satisfies BulkDataset

export const LORCANA_DECK_LIST = { sectionHeadings: { main: ["deck"] } } satisfies DeckListRules

export function normalizeLorcanaStarterDecks(zip: Uint8Array) {
  const decks = Object.entries(unzipSync(zip)).flatMap(([fileName, bytes]) => {
    const code = /^deckdata\.(.+)\.json$/.exec(fileName)?.[1]
    const deck = code ? objectRecord(JSON.parse(strFromU8(bytes))) : null
    const name = stringValue(deck?.name)
    if (!code || !name || deck?.type !== "Starter Deck") return []
    const cards = (Array.isArray(deck.cards) ? deck.cards : []).flatMap((value) => {
      const card = objectRecord(value)
      const id = finiteNumber(card?.id)
      const quantity = finiteNumber(card?.amount)
      return id === undefined || !quantity ? [] : [{ printingId: String(id), quantity }]
    })
    return cards.length ? [{ code, name, cards }] : []
  })
  return decks.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))
}

const STARTER_DECK_SOURCE = "lorcanajson"

async function refreshStarterDecks(
  ctx: ActionCtx,
  includeImages: boolean,
  format: string,
): Promise<{ count: number; status: number }> {
  const response = await fetch(`${LORCANA_JSON_URL}/decks/allDecks.zip`, {
    headers: { "User-Agent": "Scryve/1.0" },
    signal: AbortSignal.timeout(FEED_REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`LorcanaJSON decks returned ${response.status}`)
  const decks = normalizeLorcanaStarterDecks(new Uint8Array(await response.arrayBuffer()))
  let resolved = 0
  const kept: string[] = []
  for (const deck of decks) {
    const found: Array<CatalogCard | null> = await ctx.runQuery(
      internal.cardCatalog.lookupManyCached,
      { game: "lorcana", cardIds: deck.cards.map((entry) => entry.printingId) },
    )
    const entries = deck.cards.flatMap((entry, index) => {
      const card = found[index]
      return card ? [{ entry, card }] : []
    })
    if (entries.length < deck.cards.length) continue
    resolved += 1
    const legal = entries.every(({ card }) =>
      card.facets.some(({ key, value }) => key === `legality:${format}` && value === "legal"),
    )
    if (!legal) continue
    const externalId = `${format}:${deck.code}`
    kept.push(externalId)
    await ctx.runMutation(internal.deckCatalogs.upsert, {
      game: "lorcana",
      source: STARTER_DECK_SOURCE,
      externalId,
      kind: "official",
      name: deck.name,
      format,
      entries: entries.map(({ entry, card }) => ({
        identityNamespace: card.identityNamespace,
        cardId: card.cardId,
        providerCardId: entry.printingId,
        printingId: entry.printingId,
        name: card.name,
        quantity: entry.quantity,
        section: "main",
        entryKind: "card",
        originalReference: entry.printingId,
        ...(card.category ? { category: card.category } : {}),
        ...(includeImages && card.imageUrl ? { imageUrl: card.imageUrl } : {}),
        ...(includeImages && card.smallImageUrl ? { smallImageUrl: card.smallImageUrl } : {}),
      })),
    })
  }
  if (!resolved) throw new Error("No LorcanaJSON starter deck matched the synced cards")
  await ctx.runMutation(internal.deckCatalogs.removeStale, {
    game: "lorcana",
    source: STARTER_DECK_SOURCE,
    format,
    keep: kept,
  })
  return { count: kept.length, status: response.status }
}

export const LORCANA_STARTER_DECKS = {
  source: STARTER_DECK_SOURCE,
  formats: ["core", "infinity"],
  operation: (format) => `starter-decks:${format}`,
  refresh: refreshStarterDecks,
} satisfies DeckFeed
