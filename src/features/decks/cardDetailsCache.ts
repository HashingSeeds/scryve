import { Image } from "expo-image"
import type { ConvexReactClient } from "convex/react"

import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { storage } from "@/utils/storage"

import { readCardFaces } from "./cardFaces"
import { cardDetailsKey, type DeckCard } from "./deckCards"
import { api } from "../../../convex/_generated/api"

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

type DetailLookup = {
  key: string
  scryfallId?: string
  catalogCardId?: string
}

function lookupFor(
  card: DeckCard,
  game: string,
  cached: Record<string, FocusedCardDetails>,
): DetailLookup | undefined {
  const key = cardDetailsKey(card, game)
  if (cached[key]) return undefined
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
) {
  const cached = loadCardDetails(store)
  const items = [
    ...new Map(
      cards.flatMap((card) => lookupFor(card, game, cached) ?? []).map((item) => [item.key, item]),
    ).values(),
  ]
  if (items.length === 0) return []
  const found = await client.query(api.cards.detailsBatch, { game, items })
  saveCardDetails(Object.fromEntries(found.map((entry) => [entry.key, entry.details])), store)
  return found
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
