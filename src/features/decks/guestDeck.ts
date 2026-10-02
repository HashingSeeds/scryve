import { useSyncExternalStore } from "react"
import { randomUUID } from "expo-crypto"
import type { FunctionArgs } from "convex/server"

import { saveString, storage } from "@/utils/storage"

import type { api } from "../../../convex/_generated/api"
import { FREE_DECK_LIMIT, MAX_DECK_CARDS, MAX_DECK_NOTE_LENGTH } from "../../../convex/lib/policy"

const GUEST_DECKS_KEY = "decks.guest.v2"
const LEGACY_GUEST_DECK_KEY = "decks.guest.v1"
const GUEST_ROUTE_PREFIX = "guest-"
const CARD_STRING_FIELDS = [
  "game",
  "identityNamespace",
  "cardId",
  "providerCardId",
  "printingId",
  "section",
  "entryKind",
  "originalReference",
  "category",
  "oracleId",
  "scryfallId",
  "imageUrl",
  "smallImageUrl",
] as const

export type GuestDeckPayload = FunctionArgs<typeof api.decks.importResolved>
export type GuestDeck = {
  schemaVersion: 1
  localId: string
  createdAt: number
  updatedAt: number
  deck: GuestDeckPayload
}

export class GuestDeckStorageError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isPayload(value: unknown): value is GuestDeckPayload {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    value.name.trim().length < 1 ||
    value.name.length > 80 ||
    typeof value.format !== "string" ||
    value.format.trim().length < 1 ||
    value.format.length > 32
  )
    return false
  if (value.game !== undefined && (typeof value.game !== "string" || value.game.length > 64))
    return false
  if (
    value.note !== undefined &&
    (typeof value.note !== "string" || value.note.length > MAX_DECK_NOTE_LENGTH)
  )
    return false
  if (!Array.isArray(value.cards) || value.cards.length > MAX_DECK_CARDS) return false
  return value.cards.every((card) => {
    if (
      !isRecord(card) ||
      typeof card.name !== "string" ||
      card.name.trim().length < 1 ||
      card.name.length > 200 ||
      typeof card.quantity !== "number" ||
      !Number.isInteger(card.quantity) ||
      card.quantity < 1 ||
      card.quantity > 999 ||
      (card.commanderColor !== undefined &&
        (typeof card.commanderColor !== "string" || !/^[WUBRG]$/.test(card.commanderColor))) ||
      (card.board !== undefined &&
        card.board !== "main" &&
        card.board !== "sideboard" &&
        card.board !== "commander")
    )
      return false
    return CARD_STRING_FIELDS.every(
      (field) => card[field] === undefined || typeof card[field] === "string",
    )
  })
}

function isGuestDeck(value: unknown): value is GuestDeck {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.localId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.localId) &&
    typeof value.createdAt === "number" &&
    Number.isSafeInteger(value.createdAt) &&
    value.createdAt >= 0 &&
    typeof value.updatedAt === "number" &&
    Number.isSafeInteger(value.updatedAt) &&
    value.updatedAt >= value.createdAt &&
    isPayload(value.deck)
  )
}

function isGuestDeckList(value: unknown): value is GuestDeck[] {
  return (
    Array.isArray(value) &&
    value.every(isGuestDeck) &&
    new Set(value.map((deck) => deck.localId)).size === value.length
  )
}

function readRaw(key: string): string | null {
  try {
    return storage.getString(key) ?? null
  } catch {
    throw new GuestDeckStorageError("Unable to read guest decks.")
  }
}

function parseStored<T>(raw: string, valid: (value: unknown) => value is T): T {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new GuestDeckStorageError("Stored guest deck is malformed; delete it explicitly first.")
  }
  if (!valid(value))
    throw new GuestDeckStorageError("Stored guest deck is unsupported; delete it explicitly first.")
  return value
}

function readStore() {
  const raw = readRaw(GUEST_DECKS_KEY)
  const legacyRaw = readRaw(LEGACY_GUEST_DECK_KEY)
  const decks = raw === null ? [] : parseStored(raw, isGuestDeckList)
  if (legacyRaw === null) return { decks, legacy: false }
  const legacy = parseStored(legacyRaw, isGuestDeck)
  return {
    decks: decks.some((deck) => deck.localId === legacy.localId) ? decks : [...decks, legacy],
    legacy: true,
  }
}

function migrateLegacyDeck(decks: GuestDeck[]) {
  if (!saveString(GUEST_DECKS_KEY, JSON.stringify(decks))) return false
  try {
    storage.delete(LEGACY_GUEST_DECK_KEY)
    return true
  } catch {
    return false
  }
}

function readStored(): GuestDeck[] {
  let store: ReturnType<typeof readStore>
  try {
    store = readStore()
  } catch {
    return []
  }
  if (store.legacy) migrateLegacyDeck(store.decks)
  return store.decks
}

let snapshot = readStored()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function writableDecks() {
  const store = readStore()
  if (store.legacy && !migrateLegacyDeck(store.decks))
    throw new GuestDeckStorageError("Unable to save guest deck.")
  return store.decks
}

function commit(decks: GuestDeck[], failure: string) {
  if (!saveString(GUEST_DECKS_KEY, JSON.stringify(decks))) throw new GuestDeckStorageError(failure)
  snapshot = decks
  notify()
}

export function loadGuestDecks() {
  snapshot = readStored()
  return snapshot
}

export function loadGuestDeck(localId: string) {
  return loadGuestDecks().find((deck) => deck.localId === localId)
}

export function saveGuestDeck(
  deck: GuestDeckPayload,
  options: { localId?: string; now?: number } = {},
): GuestDeck {
  if (!isPayload(deck)) throw new GuestDeckStorageError("Guest deck payload is invalid.")
  const decks = writableDecks()
  const previous = options.localId
    ? decks.find((candidate) => candidate.localId === options.localId)
    : undefined
  if (options.localId && !previous)
    throw new GuestDeckStorageError("Guest deck localId does not match a saved deck.")
  if (!previous && decks.length >= FREE_DECK_LIMIT)
    throw new GuestDeckStorageError(
      `Only ${FREE_DECK_LIMIT} decks can be saved on this device. Replace one to continue.`,
    )
  const updatedAt = Math.max(options.now ?? Date.now(), (previous?.updatedAt ?? 0) + 1)
  if (!Number.isSafeInteger(updatedAt) || updatedAt < 0)
    throw new GuestDeckStorageError("Guest deck timestamp is invalid.")
  const next: GuestDeck = {
    schemaVersion: 1,
    localId: previous?.localId ?? randomUUID(),
    createdAt: previous?.createdAt ?? updatedAt,
    updatedAt,
    deck,
  }
  commit(
    previous
      ? decks.map((candidate) => (candidate.localId === previous.localId ? next : candidate))
      : [...decks, next],
    "Unable to save guest deck.",
  )
  return next
}

export function deleteGuestDeck(localId: string) {
  const decks = writableDecks()
  commit(
    decks.filter((deck) => deck.localId !== localId),
    "Unable to delete guest deck.",
  )
}

export function clearGuestDecks() {
  try {
    storage.delete(GUEST_DECKS_KEY)
    storage.delete(LEGACY_GUEST_DECK_KEY)
  } catch {
    throw new GuestDeckStorageError("Unable to delete guest decks.")
  }
  snapshot = []
  notify()
}

export function replaceGuestDeck(deck: GuestDeckPayload, expectedLocalId: string): GuestDeck {
  const decks = writableDecks()
  if (!decks.some((candidate) => candidate.localId === expectedLocalId))
    throw new GuestDeckStorageError("The saved deck changed. Review it before replacing it.")
  if (!isPayload(deck)) throw new GuestDeckStorageError("Guest deck payload is invalid.")
  const now = Date.now()
  const next: GuestDeck = {
    schemaVersion: 1,
    localId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    deck,
  }
  commit(
    decks.map((candidate) => (candidate.localId === expectedLocalId ? next : candidate)),
    "Unable to save guest deck.",
  )
  return next
}

export function acknowledgeGuestDeckImport(localId: string, updatedAt: number | null) {
  const current = loadGuestDeck(localId)
  if (!current || current.updatedAt !== updatedAt) return false
  deleteGuestDeck(localId)
  return true
}

export function guestDeckRouteId(localId: string) {
  return `${GUEST_ROUTE_PREFIX}${localId}`
}

export function guestDeckLocalId(routeId: string) {
  return routeId.startsWith(GUEST_ROUTE_PREFIX)
    ? routeId.slice(GUEST_ROUTE_PREFIX.length)
    : undefined
}

export function subscribeGuestDecks(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGuestDecks() {
  return useSyncExternalStore(
    subscribeGuestDecks,
    () => snapshot,
    () => snapshot,
  )
}

export function useGuestDeck(localId: string | undefined) {
  return useGuestDecks().find((deck) => deck.localId === localId)
}
