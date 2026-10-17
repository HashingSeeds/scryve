import {
  compact,
  facet,
  fetchDatasetJson,
  httpsUrl,
  normalizeCardName,
  objectRecord,
  stringList,
  stringValue,
  type BulkDataset,
  type DatasetCard,
} from "./cards"
import type { DeckFeed, DeckListRules } from "./decks"
import fabPrecons from "./fabPrecons.json"
import { internal } from "../../_generated/api"
import type { ActionCtx } from "../../_generated/server"

/** why: the dataset's develop branch can break, so sync reads a release tag. Bump it to ship new sets. */
const FAB_CUBE_TAG = "v8.2.0"
export const FAB_CUBE_NAMESPACE = "fab-cube-card"

const PITCH_COLORS = new Map([
  ["1", "red"],
  ["2", "yellow"],
  ["3", "blue"],
])

const FAB_FORMATS = [
  { key: "cc", field: "cc" },
  { key: "blitz", field: "blitz" },
  { key: "commoner", field: "commoner" },
  { key: "ll", field: "ll" },
  { key: "silverAge", field: "silver_age" },
  { key: "upf", field: "upf", bansOnly: true },
] as const

function fabLegality(card: Record<string, unknown>, format: (typeof FAB_FORMATS)[number]) {
  const flag = (status: string) => card[`${format.field}_${status}`] === true
  if (flag("banned")) return "banned"
  if (flag("suspended")) return "suspended"
  if (flag("restricted")) return "restricted"
  if (flag("living_legend")) return "living-legend"
  return "bansOnly" in format || flag("legal") ? "legal" : "not-legal"
}

export function normalizeFabCubeCards(value: unknown): DatasetCard[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    const card = objectRecord(candidate)
    const cardId = stringValue(card?.unique_id)
    const printedName = stringValue(card?.name)?.trim()
    if (!card || !cardId || !printedName) return []
    const pitch = PITCH_COLORS.get(String(card.pitch))
    const name = pitch ? `${printedName} (${pitch})` : printedName
    const text = stringValue(card.functional_text_plain)
    const typeLabel = stringValue(card.type_text)
    const costLabel = stringValue(card.cost)
    const printings = (Array.isArray(card.printings) ? card.printings : []).flatMap((raw) => {
      const printing = objectRecord(raw)
      const printingId = stringValue(printing?.unique_id)
      if (!printingId) return []
      const imageUrl = httpsUrl(printing?.image_url)
      return [
        {
          provider: "fab-cube",
          providerCardId: cardId,
          printingId,
          setCode: stringValue(printing?.set_id),
          collectorNumber: stringValue(printing?.id),
          rarity: stringValue(printing?.rarity),
          typeLabel,
          costLabel,
          faces: [{ index: 0, name, text, imageUrl, smallImageUrl: imageUrl }],
        },
      ]
    })
    if (printings.length === 0) return []
    return [
      {
        identityNamespace: FAB_CUBE_NAMESPACE,
        cardId,
        name,
        nameNormalized: normalizeCardName(name),
        facets: compact([
          facet("color", card.color),
          facet("pitch", card.pitch),
          facet("cost", card.cost),
          facet("power", card.power),
          facet("defense", card.defense),
          facet("health", card.health),
          facet("intelligence", card.intelligence),
          facet("arcane", card.arcane),
          facet("types", stringList(card.types).join(", ")),
          facet("keywords", stringList(card.card_keywords).join(", ")),
          ...FAB_FORMATS.map((format) =>
            facet(`legality:${format.key}`, fabLegality(card, format)),
          ),
        ]),
        printings,
      },
    ]
  })
}

export const FAB_CUBE_DATASET = {
  version: async () => FAB_CUBE_TAG,
  load: async (tag) =>
    normalizeFabCubeCards(
      await fetchDatasetJson(
        `https://raw.githubusercontent.com/the-fab-cube/flesh-and-blood-cards/${encodeURIComponent(tag)}/json/english/card.json`,
      ),
    ),
} satisfies BulkDataset

export const FAB_DECK_LIST = {
  sectionHeadings: {
    hero: ["hero"],
    arena: ["arena cards", "arena", "equipment", "weapons"],
    main: ["deck cards", "deck", "main deck", "main"],
  },
  skipsLine: (line) => /^(?:name|format):|^made with\b|^see the full deck\b/i.test(line),
  headerCard: (line) => {
    const hero = /^hero:\s*(.+)$/i.exec(line)?.[1]?.trim()
    return hero ? { section: "hero", reference: hero } : undefined
  },
} satisfies DeckListRules

export function fabPreconEntries(deck: (typeof fabPrecons)[number]) {
  return [
    { cardId: deck.heroId, name: deck.hero, quantity: 1, section: "hero" },
    ...deck.cards.map((card) => ({
      cardId: card.id,
      name: card.pitch ? `${card.name} (${card.pitch})` : card.name,
      quantity: card.count,
      section: card.pitch ? "main" : "arena",
    })),
  ]
}

async function refreshFabPrecons(ctx: ActionCtx, includeImages: boolean, format: string) {
  const decks = fabPrecons
    .filter((deck) => deck.format === format)
    .sort((a, b) => a.releasedAt.localeCompare(b.releasedAt))
  const unresolved: string[] = []
  for (const deck of decks) {
    const entries = fabPreconEntries(deck)
    const cards = await ctx.runQuery(internal.cardCatalog.lookupManyCached, {
      game: "fab",
      cardIds: entries.map((entry) => entry.cardId),
    })
    const resolved = entries.flatMap((entry, index) => {
      const card = cards[index]
      if (!card) return []
      return [
        {
          identityNamespace: card.identityNamespace,
          cardId: card.cardId,
          ...(card.providerCardId ? { providerCardId: card.providerCardId } : {}),
          ...(card.printingId ? { printingId: card.printingId } : {}),
          name: card.name,
          quantity: entry.quantity,
          section: entry.section,
          entryKind: "card",
          ...(includeImages && card.imageUrl ? { imageUrl: card.imageUrl } : {}),
          ...(includeImages && card.smallImageUrl ? { smallImageUrl: card.smallImageUrl } : {}),
        },
      ]
    })
    if (resolved.length < entries.length) {
      unresolved.push(deck.name)
      continue
    }
    await ctx.runMutation(internal.deckCatalogs.upsert, {
      game: "fab",
      source: FAB_PRECON_FEED.source,
      externalId: deck.sourceUrl,
      kind: "official",
      name: deck.name,
      format,
      sourceUrl: deck.sourceUrl,
      publishedAt: Date.parse(deck.releasedAt),
      entries: resolved,
    })
  }
  await ctx.runMutation(internal.deckCatalogs.removeStale, {
    game: "fab",
    source: FAB_PRECON_FEED.source,
    format,
    keep: decks.map((deck) => deck.sourceUrl),
  })
  if (unresolved.length)
    throw new Error(
      `Cards not synced yet for ${unresolved.length} precons: ${unresolved.join(", ")}`,
    )
  return { count: decks.length, status: 200 }
}

export const FAB_PRECON_FEED = {
  source: "legend-story-studios",
  formats: [...new Set(fabPrecons.map((deck) => deck.format))],
  operation: (format) => `deck-feed-refresh:${format}`,
  refresh: refreshFabPrecons,
} satisfies DeckFeed
