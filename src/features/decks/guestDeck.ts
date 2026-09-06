import { useSyncExternalStore } from "react"
import { randomUUID } from "expo-crypto"
import type { FunctionArgs } from "convex/server"

import { saveString, storage } from "@/utils/storage"

import type { api } from "../../../convex/_generated/api"
import { MAX_DECK_CARDS, MAX_DECK_NOTE_LENGTH } from "../../../convex/lib/policy"

const GUEST_DECK_KEY = "decks.guest.v1"
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

function readRaw(): string | null {
  try {
    return storage.getString(GUEST_DECK_KEY) ?? null
  } catch {
    throw new GuestDeckStorageError("Unable to read guest deck.")
  }
}

function readStored(): GuestDeck | undefined {
  let raw: string | null
  try {
    raw = readRaw()
  } catch {
    return undefined
  }
  if (raw === null) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    return isGuestDeck(value) ? value : undefined
  } catch {
    return undefined
  }
}

let snapshot = readStored()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function assertWritable() {
  const raw = readRaw()
  if (raw !== null) {
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new GuestDeckStorageError("Stored guest deck is malformed; delete it explicitly first.")
    }
    if (!isGuestDeck(value))
      throw new GuestDeckStorageError(
        "Stored guest deck is unsupported; delete it explicitly first.",
      )
    return value
  }
  return undefined
}

export function loadGuestDeck() {
  snapshot = readStored()
  return snapshot
}

export function saveGuestDeck(
  deck: GuestDeckPayload,
  options: { localId?: string; now?: number } = {},
): GuestDeck {
  if (!isPayload(deck)) throw new GuestDeckStorageError("Guest deck payload is invalid.")
  const previous = assertWritable()
  if (previous && !options.localId)
    throw new GuestDeckStorageError("A guest deck already exists; provide its localId to edit it.")
  if (options.localId && previous?.localId !== options.localId)
    throw new GuestDeckStorageError("Guest deck localId does not match the saved deck.")
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
  if (!saveString(GUEST_DECK_KEY, JSON.stringify(next)))
    throw new GuestDeckStorageError("Unable to save guest deck.")
  snapshot = next
  notify()
  return next
}

export function deleteGuestDeck() {
  try {
    storage.delete(GUEST_DECK_KEY)
  } catch {
    throw new GuestDeckStorageError("Unable to delete guest deck.")
  }
  snapshot = undefined
  notify()
}

export function replaceGuestDeck(deck: GuestDeckPayload, expectedLocalId: string): GuestDeck {
  const previous = assertWritable()
  if (previous?.localId !== expectedLocalId)
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
  if (!saveString(GUEST_DECK_KEY, JSON.stringify(next)))
    throw new GuestDeckStorageError("Unable to save guest deck.")
  snapshot = next
  notify()
  return next
}

export function acknowledgeGuestDeckImport(localId: string, updatedAt: number | null) {
  const current = loadGuestDeck()
  if (current?.localId !== localId || current.updatedAt !== updatedAt) return false
  deleteGuestDeck()
  return true
}

export function subscribeGuestDeck(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGuestDeck() {
  return useSyncExternalStore(
    subscribeGuestDeck,
    () => snapshot,
    () => snapshot,
  )
}
