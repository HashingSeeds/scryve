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
  type DatasetCard,
} from "./cards"
import type { DeckListRules } from "./decks"

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
