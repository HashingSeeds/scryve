import { Image } from "expo-image"
import type { ConvexReactClient } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { storage } from "@/utils/storage"

import { readCardFaces } from "./cardFaces"
import { cardDetailsKey, type DeckCard } from "./deckCards"
import { api } from "../../../convex/_generated/api"
import { readsCardDetails } from "../../../convex/lib/deckRules"

export interface CardDetailStore {
  getString(key: string): string | undefined
  set(key: string, value: string): void
  delete(key: string): void
  addOnValueChangedListener?(listener: (key: string) => void): unknown
}

const DETAILS_KEY = "scryve.cards.details.v1"
const MAX_DETAILS_ENTRIES = 1500

function isDetails(value: unknown): value is FocusedCardDetails {
  if (typeof value !== "object" || value === null) return false
  return Object.values(value).every((field) => field === undefined || typeof field === "string")
}

const sessionDetails = new WeakMap<CardDetailStore, Map<string, FocusedCardDetails>>()
const watchedStores = new WeakSet<CardDetailStore>()
let writingOwnBlob = false

function detailsFor(store: CardDetailStore): Map<string, FocusedCardDetails> {
  const existing = sessionDetails.get(store)
  if (existing) return existing
  if (!watchedStores.has(store)) {
    watchedStores.add(store)
    store.addOnValueChangedListener?.((key) => {
      if (key === DETAILS_KEY && !writingOwnBlob) sessionDetails.delete(store)
    })
  }
  let parsed: unknown = null
  try {
    parsed = JSON.parse(store.getString(DETAILS_KEY) ?? "null")
  } catch {}
  const entries =
    typeof parsed === "object" && parsed !== null
      ? Object.entries(parsed).filter((entry): entry is [string, FocusedCardDetails] =>
          isDetails(entry[1]),
        )
      : []
  const details = new Map(entries)
  sessionDetails.set(store, details)
  return details
}

export function loadCardDetails(
  store: CardDetailStore = storage,
): Record<string, FocusedCardDetails> {
  return Object.fromEntries(detailsFor(store))
}

export function saveCardDetails(
  entries: Record<string, FocusedCardDetails>,
  store: CardDetailStore = storage,
): void {
  const details = detailsFor(store)
  for (const [key, value] of Object.entries(entries)) {
    details.delete(key)
    details.set(key, value)
  }
  for (const key of details.keys()) {
    if (details.size <= MAX_DETAILS_ENTRIES) break
    details.delete(key)
  }
  writingOwnBlob = true
  try {
    store.set(DETAILS_KEY, JSON.stringify(Object.fromEntries(details)))
  } catch (error) {
    console.error("[card-details-cache] failed to persist", error)
  } finally {
    writingOwnBlob = false
  }
}

export function readCardDetail(
  key: string,
  store: CardDetailStore = storage,
): FocusedCardDetails | undefined {
  return detailsFor(store).get(key)
}

export function clearCardDetails(store: CardDetailStore = storage): void {
  sessionDetails.delete(store)
  try {
    store.delete(DETAILS_KEY)
  } catch (error) {
    console.error("[card-details-cache] failed to clear", error)
  }
}

/** why: the device's Magic card file leaves out rules text. Only Magic details carry commander rules, and only server ones date them. */
export function partialMagicDetails(details: FocusedCardDetails) {
  return details.commanderEligibility !== undefined && details.commanderRulesUpdatedAt === undefined
}

/**
 * why: Lorcana text cached before the catalog resynced keeps its printed line wraps. Resynced lines are whole
 * abilities, so a line that runs on into lowercase or a "+1", or a long line cut off mid-sentence, marks the old text.
 */
export function staleCardDetails(game: string, details: FocusedCardDetails) {
  if (partialMagicDetails(details)) return true
  if (game !== "lorcana") return false
  const lines = (details.oracleText ?? "").split("\n")
  return lines
    .slice(1)
    .some(
      (next, index) =>
        /^([a-z]|\+\d)/.test(next) ||
        (!/[.)!?:"”]$/.test(lines[index]) && lines[index].split(" ").length > 5),
    )
}

type DetailLookup = {
  key: string
  scryfallId?: string
  catalogCardId?: string
}

function lookupFor(
  card: DeckCard,
  game: string,
  cached: Record<string, FocusedCardDetails>,
  wantsFacets: boolean,
): DetailLookup | undefined {
  const key = cardDetailsKey(card, game)
  const entry = cached[key]
  // why: only catalog cards send facets; Scryfall details never have them, so asking again would loop.
  if (
    entry &&
    !staleCardDetails(game, entry) &&
    (!wantsFacets || card.scryfallId || entry.facets !== undefined)
  )
    return undefined
  if (card.scryfallId) return { key, scryfallId: card.scryfallId }
  const catalogCardId = card.cardId ?? card.printingId ?? card.providerCardId
  if (catalogCardId) return { key, catalogCardId }
  return undefined
}

export async function fetchCardDetails(
  client: Pick<ConvexReactClient, "query">,
  game: string,
  cards: readonly DeckCard[],
  store: CardDetailStore = storage,
  retry = true,
): Promise<DetailBatch> {
  const cached = loadCardDetails(store)
  const wantsFacets = readsCardDetails(game)
  const lookups = [
    ...new Map(
      cards
        .flatMap((card) => lookupFor(card, game, cached, wantsFacets) ?? [])
        .map((item) => [item.key, item]),
    ).values(),
  ]
  const waiting = lookups.flatMap((item) => inFlight.get(item.key) ?? [])
  const items = lookups.filter((item) => !inFlight.has(item.key))
  /** why: a failed request another screen started leaves its cards stale, so look them up again once. */
  const retryFailed = async (found: DetailBatch) => {
    const settled = await Promise.allSettled(waiting)
    if (!retry || settled.every((result) => result.status === "fulfilled")) return found
    return [...found, ...(await fetchCardDetails(client, game, cards, store, false))]
  }
  if (items.length === 0) return await retryFailed([])
  const request = client.query(api.cards.detailsBatch, { game, items }).then((found) => {
    saveCardDetails(Object.fromEntries(found.map((entry) => [entry.key, entry.details])), store)
    return found
  })
  for (const item of items) inFlight.set(item.key, request)
  try {
    return await retryFailed(await request)
  } finally {
    for (const item of items) if (inFlight.get(item.key) === request) inFlight.delete(item.key)
  }
}

type DetailBatch = FunctionReturnType<typeof api.cards.detailsBatch>

const inFlight = new Map<string, Promise<unknown>>()
const completing = new Map<string, Promise<FocusedCardDetails>>()

/** why: a deck screen that asks for this card meanwhile waits for it instead of finding nothing on the server. */
export function completeCardDetails(
  key: string,
  load: () => Promise<FocusedCardDetails>,
  store: CardDetailStore = storage,
) {
  const existing = completing.get(key)
  if (existing) return existing
  const request = load().then((details) => {
    saveCardDetails({ [key]: details }, store)
    return details
  })
  completing.set(key, request)
  inFlight.set(key, request)
  void request
    .catch(() => {})
    .finally(() => {
      completing.delete(key)
      if (inFlight.get(key) === request) inFlight.delete(key)
    })
  return request
}

const warmedVersions = new Set<string>()

export async function prefetchCardDetails(
  client: Pick<ConvexReactClient, "query">,
  input: { game: string; versionId: string; revision: number; cards: readonly DeckCard[] },
  store: CardDetailStore = storage,
): Promise<void> {
  const versionKey = `${input.game}:${input.versionId}:${input.revision}`
  if (warmedVersions.has(versionKey)) return
  warmedVersions.add(versionKey)
  try {
    const found = await fetchCardDetails(client, input.game, input.cards, store)
    const urls = [
      ...new Set(
        found
          .flatMap((entry) => [
            entry.details.imageUrl,
            entry.details.smallImageUrl,
            ...readCardFaces(entry.details.faceDetails).flatMap((face) => [
              face.imageUrl,
              face.smallImageUrl,
            ]),
          ])
          .filter((url): url is string => Boolean(url)),
      ),
    ]
    if (urls.length > 0 && typeof Image.prefetch === "function") {
      await Image.prefetch(urls, "disk")
    }
  } catch {
    warmedVersions.delete(versionKey)
  }
}
