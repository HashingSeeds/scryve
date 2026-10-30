import { useSyncExternalStore } from "react"
import { Platform } from "react-native"
import { randomUUID } from "expo-crypto"
import type { FunctionArgs } from "convex/server"

import { translate } from "@/i18n/translate"
import { ErrorType, reportCrash } from "@/utils/crashReporting"
import { saveString, storage } from "@/utils/storage"

import type { api } from "../../../convex/_generated/api"
import { MAX_DECK_CARDS, MAX_DECK_NOTE_LENGTH } from "../../../convex/lib/policy"

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

export type GuestDeckPayload = Omit<FunctionArgs<typeof api.decks.importResolved>, "deckKey">
export type GuestDeck = {
  schemaVersion: 1
  localId: string
  createdAt: number
  updatedAt: number
  deck: GuestDeckPayload
  deckKey?: string
  guestLocalId?: string
  movedFromAccount?: boolean
}

export class GuestDeckStorageError extends Error {
  constructor(
    message: string,
    readonly reason?: "read_failed" | "malformed" | "unsupported",
  ) {
    super(message)
    this.name = "GuestDeckStorageError"
  }
}

const reportedStorageFailures = new Set<string>()

function reportStorageFailure(kind: "load" | "save", reason?: GuestDeckStorageError["reason"]) {
  const key = `${kind}:${reason ?? "unknown"}`
  if (reportedStorageFailures.has(key)) return
  reportedStorageFailures.add(key)
  const error = new Error(`Device deck store ${kind} failed`)
  error.name = kind === "load" ? "GuestDeckLoadFailed" : "GuestDeckSaveFailed"
  const tags = { platform: Platform.OS === "web" ? "web" : "native", ...(reason ? { reason } : {}) }
  // why: the initial store read can run before the root initializes Sentry.
  queueMicrotask(() => {
    reportCrash(error, ErrorType.HANDLED, {
      tags,
      fingerprint: ["guest-deck-storage", kind],
    })
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isGuestDeckPayload(value: unknown): value is GuestDeckPayload {
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
    isGuestDeckPayload(value.deck) &&
    (value.movedFromAccount === undefined || typeof value.movedFromAccount === "boolean") &&
    (value.deckKey === undefined ||
      (typeof value.deckKey === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value.deckKey))) &&
    (value.guestLocalId === undefined ||
      (typeof value.guestLocalId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value.guestLocalId,
        )))
  )
}

function partitionDecks(entries: unknown[]) {
  const decks: GuestDeck[] = []
  const unreadable: unknown[] = []
  for (const entry of entries) {
    if (isGuestDeck(entry) && !decks.some((deck) => deck.localId === entry.localId))
      decks.push(entry)
    else unreadable.push(entry)
  }
  return { decks, unreadable }
}

function readRaw(key: string): string | null {
  try {
    return storage.getString(key) ?? null
  } catch {
    throw new GuestDeckStorageError(translate("decks:guestStorage.readFailed"), "read_failed")
  }
}

function parseStored<T>(raw: string, valid: (value: unknown) => value is T): T {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new GuestDeckStorageError(translate("decks:guestStorage.malformed"), "malformed")
  }
  if (!valid(value))
    throw new GuestDeckStorageError(translate("decks:guestStorage.unsupported"), "unsupported")
  return value
}

function readStore() {
  const raw = readRaw(GUEST_DECKS_KEY)
  const legacyRaw = readRaw(LEGACY_GUEST_DECK_KEY)
  const { decks, unreadable } = partitionDecks(
    raw === null ? [] : parseStored(raw, (value): value is unknown[] => Array.isArray(value)),
  )
  if (legacyRaw === null) return { decks, unreadable, legacy: false }
  const legacy = parseStored(legacyRaw, isGuestDeck)
  return {
    decks: decks.some((deck) => deck.localId === legacy.localId) ? decks : [...decks, legacy],
    unreadable,
    legacy: true,
  }
}

function serialize(decks: GuestDeck[]) {
  return JSON.stringify([...decks, ...unreadable])
}

function migrateLegacyDeck(decks: GuestDeck[]) {
  if (!saveString(GUEST_DECKS_KEY, serialize(decks))) {
    reportStorageFailure("save")
    return false
  }
  try {
    storage.delete(LEGACY_GUEST_DECK_KEY)
    return true
  } catch {
    return false
  }
}

let loadError: unknown
let pendingLegacy = false
let unreadable: unknown[] = []

function readStored(): GuestDeck[] {
  loadError = undefined
  unreadable = []
  let store: ReturnType<typeof readStore>
  try {
    store = readStore()
  } catch (cause) {
    loadError = cause
    reportStorageFailure("load", cause instanceof GuestDeckStorageError ? cause.reason : undefined)
    return []
  }
  unreadable = store.unreadable
  if (unreadable.length > 0) reportStorageFailure("load", "unsupported")
  pendingLegacy = store.legacy && !migrateLegacyDeck(store.decks)
  return store.decks
}

let snapshot = readStored()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function writableDecks() {
  const decks = Platform.OS === "web" ? readStored() : snapshot
  if (loadError) throw loadError
  return decks
}

function commit(decks: GuestDeck[], failure: string) {
  if (!saveString(GUEST_DECKS_KEY, serialize(decks))) {
    reportStorageFailure("save")
    throw new GuestDeckStorageError(failure)
  }
  snapshot = decks
  if (pendingLegacy) {
    try {
      storage.delete(LEGACY_GUEST_DECK_KEY)
      pendingLegacy = false
    } catch {}
  }
  notify()
}

export function loadGuestDecks() {
  snapshot = readStored()
  return snapshot
}

export function loadGuestDeck(localId: string) {
  return snapshot.find((deck) => deck.localId === localId)
}

export function saveGuestDeck(
  deck: GuestDeckPayload,
  options: {
    localId?: string
    now?: number
    deckKey?: string
    guestLocalId?: string
    movedFromAccount?: boolean
  } = {},
): GuestDeck {
  if (!isGuestDeckPayload(deck))
    throw new GuestDeckStorageError(translate("decks:guestStorage.invalid"))
  const decks = writableDecks()
  const previous = options.localId
    ? decks.find((candidate) => candidate.localId === options.localId)
    : undefined
  if (options.localId && !previous)
    throw new GuestDeckStorageError("Guest deck localId does not match a saved deck.")
  const updatedAt = Math.max(options.now ?? Date.now(), previous ? previous.updatedAt + 1 : 0)
  if (!Number.isSafeInteger(updatedAt) || updatedAt < 0)
    throw new GuestDeckStorageError("Guest deck timestamp is invalid.")
  const localId = previous?.localId ?? randomUUID()
  const deckKey = previous?.deckKey ?? previous?.localId ?? options.deckKey ?? localId
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(deckKey) ||
    (previous && options.deckKey !== undefined && options.deckKey !== deckKey)
  )
    throw new GuestDeckStorageError("Deck key cannot change.")
  const next: GuestDeck = {
    schemaVersion: 1,
    localId,
    deckKey,
    guestLocalId: previous?.guestLocalId ?? options.guestLocalId,
    movedFromAccount: previous?.movedFromAccount ?? options.movedFromAccount,
    createdAt: previous?.createdAt ?? updatedAt,
    updatedAt,
    deck,
  }
  commit(
    previous
      ? decks.map((candidate) => (candidate.localId === previous.localId ? next : candidate))
      : [...decks, next],
    translate("decks:guestStorage.saveFailed"),
  )
  return next
}

export function deleteGuestDeck(localId: string) {
  const decks = writableDecks()
  commit(
    decks.filter((deck) => deck.localId !== localId),
    translate("decks:guestStorage.deleteFailed"),
  )
}

export function clearGuestDecks() {
  try {
    storage.delete(GUEST_DECKS_KEY)
    storage.delete(LEGACY_GUEST_DECK_KEY)
  } catch {
    throw new GuestDeckStorageError(translate("decks:guestStorage.deleteAllFailed"))
  }
  snapshot = []
  loadError = undefined
  pendingLegacy = false
  unreadable = []
  notify()
}

export function acknowledgeGuestDeckImport(localId: string, updatedAt: number | null) {
  const current = writableDecks().find((deck) => deck.localId === localId)
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
