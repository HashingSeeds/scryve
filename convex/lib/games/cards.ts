import type { ActionCtx } from "../../_generated/server"
import type { GameSystemId } from "../integrations"

export const MAX_CARD_FACES = 4
export const MAX_CARD_FACETS = 32
export const MAX_CATALOG_BATCH = 25
export const MAX_DATASET_BATCH = 100
const DATASET_REQUEST_TIMEOUT_MS = 120_000

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

export type ProviderCards = Promise<{ cards: NormalizedCard[]; status: number }>

export type DatasetCard = Omit<NormalizedCard, "game">

export type BulkDataset = {
  readonly version: () => Promise<string>
  readonly load: (version: string) => Promise<DatasetCard[]>
}

type CatalogSource =
  | {
      readonly search: (ctx: ActionCtx, query: string, includeImages: boolean) => ProviderCards
      readonly byId: (ctx: ActionCtx, cardId: string, includeImages: boolean) => ProviderCards
      readonly bulk?: never
    }
  | { readonly bulk: BulkDataset; readonly search?: never; readonly byId?: never }

export type CardCatalog = CatalogSource & {
  readonly cachedCardComplete?: (card: CatalogCard) => boolean
  /** why: search returns brief cards, so caching one must not erase what a full lookup stored. */
  readonly briefSearchResults?: true
  readonly imageUrl?: (card: {
    printingId?: string
    providerCardId?: string
    cardId?: string
  }) => string | undefined
  readonly seeded?: {
    readonly format: string
    readonly cards: readonly NormalizedCard[]
    readonly owns: (cardId: string) => boolean
    readonly missing: string
  }
}

export function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export function stringList(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item) => stringValue(item) ?? []) : []
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

export function httpsUrl(value: unknown) {
  const url = stringValue(value)
  return url?.startsWith("https://") ? url : undefined
}

export async function fetchDatasetJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "Scryve/1.0" },
    signal: AbortSignal.timeout(DATASET_REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw Object.assign(new Error(`Dataset fetch failed: ${url}`), { response })
  return await response.json()
}
