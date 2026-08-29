import {
  compact,
  facet,
  normalizeCardName,
  objectRecord,
  stringValue,
  type CardFace,
  type NormalizedCard,
} from "./cards"

function faceFromValue(value: unknown, index: number): CardFace | null {
  const face = objectRecord(value)
  if (!face) return null
  const images = objectRecord(face.image_uris)
  return {
    index,
    ...(stringValue(face.name) ? { name: stringValue(face.name) } : {}),
    ...(stringValue(face.oracle_text) ? { text: stringValue(face.oracle_text) } : {}),
    ...(stringValue(images?.normal) ? { imageUrl: stringValue(images?.normal) } : {}),
    ...(stringValue(images?.small) ? { smallImageUrl: stringValue(images?.small) } : {}),
  }
}

export function normalizeScryfallCatalogCard(value: unknown): NormalizedCard | null {
  const card = objectRecord(value)
  const providerCardId = stringValue(card?.id)
  const name = stringValue(card?.name)
  if (!card || !providerCardId || !name) return null
  const cardId = stringValue(card.oracle_id) ?? providerCardId
  const imageUris = objectRecord(card.image_uris)
  const rawFaces = Array.isArray(card.card_faces) ? card.card_faces : []
  const faces =
    rawFaces.length > 0
      ? rawFaces.flatMap((candidate, index) => {
          const face = faceFromValue(candidate, index)
          return face ? [face] : []
        })
      : [
          {
            index: 0,
            name,
            ...(stringValue(card.oracle_text) ? { text: stringValue(card.oracle_text) } : {}),
            ...(stringValue(imageUris?.normal) ? { imageUrl: stringValue(imageUris?.normal) } : {}),
            ...(stringValue(imageUris?.small)
              ? { smallImageUrl: stringValue(imageUris?.small) }
              : {}),
          },
        ]
  return {
    game: "mtg",
    identityNamespace: "scryfall-oracle",
    cardId,
    name,
    nameNormalized: normalizeCardName(name),
    ...(stringValue(card.layout) ? { category: stringValue(card.layout) } : {}),
    facets: compact([facet("manaCost", card.mana_cost), facet("typeLine", card.type_line)]),
    printings: [
      {
        provider: "scryfall",
        providerCardId,
        printingId: providerCardId,
        ...(stringValue(card.set) ? { setCode: stringValue(card.set) } : {}),
        ...(stringValue(card.collector_number)
          ? { collectorNumber: stringValue(card.collector_number) }
          : {}),
        ...(stringValue(card.lang) ? { language: stringValue(card.lang) } : {}),
        ...(stringValue(card.rarity) ? { rarity: stringValue(card.rarity) } : {}),
        ...(stringValue(card.type_line) ? { typeLabel: stringValue(card.type_line) } : {}),
        ...(stringValue(card.mana_cost) ? { costLabel: stringValue(card.mana_cost) } : {}),
        faces,
      },
    ],
  }
}
