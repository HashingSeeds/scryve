import type { GameSystemId } from "../integrations"

export const MAX_CARD_FACES = 4
export const MAX_CARD_FACETS = 32
export const MAX_CATALOG_BATCH = 25

export type CardFace = {
  index: number
  name?: string
  text?: string
  imageUrl?: string
  smallImageUrl?: string
}

export type CardPrinting = {
  provider: string
  providerCardId: string
  printingId: string
  setCode?: string
  collectorNumber?: string
  language?: string
  rarity?: string
  typeLabel?: string
  costLabel?: string
  faces: CardFace[]
}

export type NormalizedCard = {
  game: GameSystemId
  identityNamespace: string
  cardId: string
  name: string
  nameNormalized: string
  category?: string
  facets: Array<{ key: string; value: string }>
  printings: CardPrinting[]
}

export type CatalogCard = {
  game: GameSystemId
  identityNamespace: string
  cardId: string
  name: string
  category?: string
  facets: Array<{ key: string; value: string }>
  providerCardId?: string
  printingId?: string
  setCode?: string
  collectorNumber?: string
  rarity?: string
  typeLabel?: string
  text?: string
  imageUrl?: string
  smallImageUrl?: string
  faces: CardFace[]
}

export function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)))
    return Number(value)
  return undefined
}

export function normalizeCardName(name: string) {
  return name.trim().toLocaleLowerCase("en").replace(/\s+/g, " ")
}

export function compact<T>(values: Array<T | undefined>): T[] {
  return values.filter((value): value is T => value !== undefined)
}

export function facet(key: string, value: unknown) {
  const parsed = stringValue(value) ?? finiteNumber(value)?.toString()
  return parsed ? { key, value: parsed } : undefined
}
