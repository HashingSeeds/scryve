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
import type { DeckListRules } from "./decks"

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
