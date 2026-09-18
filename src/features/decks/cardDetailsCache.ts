import { Image } from "expo-image"
import type { ConvexReactClient } from "convex/react"

import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { storage } from "@/utils/storage"

import { cardDetailsKey, type DeckCard } from "./deckCards"
import { api } from "../../../convex/_generated/api"

export interface CardDetailStore {
  getString(key: string): string | undefined
  set(key: string, value: string): void
  delete(key: string): void
}

const DETAILS_KEY = "scryve.cards.details.v1"
const MAX_DETAILS_ENTRIES = 1500

function isDetails(value: unknown): value is FocusedCardDetails {
  if (typeof value !== "object" || value === null) return false
  return Object.values(value).every((field) => field === undefined || typeof field === "string")
}

export function loadCardDetails(
  store: CardDetailStore = storage,
): Record<string, FocusedCardDetails> {
  let parsed: unknown = null
  try {
    parsed = JSON.parse(store.getString(DETAILS_KEY) ?? "null")
  } catch {
    return {}
  }
  if (typeof parsed !== "object" || parsed === null) return {}
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, FocusedCardDetails] =>
      isDetails(entry[1]),
    ),
  )
}

export function saveCardDetails(
  entries: Record<string, FocusedCardDetails>,
  store: CardDetailStore = storage,
): void {
  const merged = { ...loadCardDetails(store), ...entries }
  const keys = Object.keys(merged)
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_DETAILS_ENTRIES))) {
    delete merged[key]
  }
  try {
    store.set(DETAILS_KEY, JSON.stringify(merged))
  } catch (error) {
    console.error("[card-details-cache] failed to persist", error)
  }
}

export function readCardDetail(
  key: string,
  store: CardDetailStore = storage,
): FocusedCardDetails | undefined {
  return loadCardDetails(store)[key]
}

export function clearCardDetails(store: CardDetailStore = storage): void {
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

function lookupFor(card: DeckCard, game: string, store: CardDetailStore): DetailLookup | undefined {
  const key = cardDetailsKey(card, game)
  if (readCardDetail(key, store)) return undefined
  if (card.scryfallId) return { key, scryfallId: card.scryfallId }
  const catalogCardId = card.cardId ?? card.printingId ?? card.providerCardId
  if (catalogCardId) return { key, catalogCardId }
  return undefined
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
  const items = input.cards.flatMap((card) => lookupFor(card, input.game, store) ?? [])
  if (items.length === 0) return
  try {
    const found = await client.query(api.cards.detailsBatch, { game: input.game, items })
    saveCardDetails(Object.fromEntries(found.map((entry) => [entry.key, entry.details])), store)
    const urls = [
      ...new Set(
        found
          .flatMap((entry) => [entry.details.imageUrl, entry.details.smallImageUrl])
          .filter((url): url is string => Boolean(url)),
      ),
    ]
    if (urls.length > 0 && typeof Image.prefetch === "function") {
      await Image.prefetch(urls)
    }
  } catch {
    warmedVersions.delete(versionKey)
  }
}
