import { useSyncExternalStore } from "react"
import { Platform } from "react-native"
import { randomUUID } from "expo-crypto"
import type { FunctionArgs } from "convex/server"

import { translate } from "@/i18n/translate"
import { localCardDb } from "@/storage/localDb"
import { ErrorType, reportCrash } from "@/utils/crashReporting"
import { storage } from "@/utils/storage"

import type { api } from "../../../convex/_generated/api"
import { DEFAULT_VERSION_NAME } from "../../../convex/lib/deckVersions"
import {
  MAX_DECK_CARDS,
  MAX_DECK_NOTE_LENGTH,
  MAX_DECK_VERSIONS,
  MAX_VERSION_NAME_LENGTH,
} from "../../../convex/lib/policy"

const GUEST_DECKS_KEY = "decks.guest.v2"
const LEGACY_GUEST_DECK_KEY = "decks.guest.v1"
const UNREADABLE_META_KEY = "unreadable"
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
type GuestCards = GuestDeckPayload["cards"]
export type GuestDeckVersion = {
  number: number
  name: string
  note?: string
  createdAt: number
  updatedAt: number
  cards: GuestCards
}
// why: the latest version keeps its cards in `deck`, so builds that predate versions still read the current list.
type StoredGuestVersion = Omit<GuestDeckVersion, "cards"> & { cards?: GuestCards }
export type GuestDeck = {
  schemaVersion: 1
  localId: string
  createdAt: number
  updatedAt: number
  deck: GuestDeckPayload
  deckKey?: string
  guestLocalId?: string
  movedFromAccount?: boolean
  versions?: StoredGuestVersion[]
  bringing?: number
}
export type NewGuestDeckVersion = {
  number?: number
  name: string
  note?: string
  cards: GuestCards
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
  return isCardList(value.cards)
}

function isCardList(value: unknown): value is GuestCards {
  if (!Array.isArray(value) || value.length > MAX_DECK_CARDS) return false
  return value.every((card) => {
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

function isStoredVersions(value: unknown): value is StoredGuestVersion[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DECK_VERSIONS) return false
  let previous = 0
  return value.every((version, index) => {
    if (
      !isRecord(version) ||
      typeof version.number !== "number" ||
      !Number.isSafeInteger(version.number) ||
      version.number <= previous ||
      typeof version.name !== "string" ||
      version.name.trim().length < 1 ||
      version.name.length > MAX_VERSION_NAME_LENGTH ||
      (version.note !== undefined &&
        (typeof version.note !== "string" || version.note.length > MAX_DECK_NOTE_LENGTH)) ||
      typeof version.createdAt !== "number" ||
      !Number.isSafeInteger(version.createdAt) ||
      typeof version.updatedAt !== "number" ||
      !Number.isSafeInteger(version.updatedAt)
    )
      return false
    previous = version.number
    return index === value.length - 1 ? version.cards === undefined : isCardList(version.cards)
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
    (value.versions === undefined || isStoredVersions(value.versions)) &&
    (value.bringing === undefined ||
      (typeof value.bringing === "number" && Number.isSafeInteger(value.bringing))) &&
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

function readDbRows() {
  try {
    const rows = localCardDb.listGuestDecks()
    const metaRaw = localCardDb.getGuestMeta(UNREADABLE_META_KEY)
    return { rows, metaRaw }
  } catch {
    throw new GuestDeckStorageError(translate("decks:guestStorage.readFailed"), "read_failed")
  }
}

function readStore() {
  const { rows, metaRaw } = readDbRows()
  const rawEntries: unknown[] = []
  for (const row of rows) {
    try {
      rawEntries.push(JSON.parse(row.payload))
    } catch {
      rawEntries.push(row.payload)
    }
  }
  const { decks, unreadable: rowUnreadable } = partitionDecks(rawEntries)
  let savedUnreadable: unknown[] = []
  if (metaRaw !== undefined) {
    try {
      const parsed: unknown = JSON.parse(metaRaw)
      if (Array.isArray(parsed)) savedUnreadable = parsed
    } catch {}
  }
  const mergedUnreadable = [...savedUnreadable, ...rowUnreadable]

  const legacyV2Raw = readRaw(GUEST_DECKS_KEY)
  const legacyV1Raw = readRaw(LEGACY_GUEST_DECK_KEY)
  if (legacyV2Raw === null && legacyV1Raw === null) {
    return { decks, unreadable: mergedUnreadable, legacy: false }
  }

  const mergedDecks = [...decks]
  if (legacyV2Raw !== null) {
    const parsedV2 = partitionDecks(
      parseStored(legacyV2Raw, (value): value is unknown[] => Array.isArray(value)),
    )
    for (const deck of parsedV2.decks) {
      if (!mergedDecks.some((existing) => existing.localId === deck.localId)) mergedDecks.push(deck)
    }
    mergedUnreadable.push(...parsedV2.unreadable)
  }
  if (legacyV1Raw !== null) {
    const legacyDeck = parseStored(legacyV1Raw, isGuestDeck)
    if (!mergedDecks.some((existing) => existing.localId === legacyDeck.localId))
      mergedDecks.push(legacyDeck)
  }
  return { decks: mergedDecks, unreadable: mergedUnreadable, legacy: true }
}

function clearLegacyKeys() {
  try {
    storage.delete(GUEST_DECKS_KEY)
    storage.delete(LEGACY_GUEST_DECK_KEY)
    return true
  } catch {
    return false
  }
}

function persistUnreadable(entries: unknown[]) {
  if (entries.length > 0) localCardDb.setGuestMeta(UNREADABLE_META_KEY, JSON.stringify(entries))
  else localCardDb.deleteGuestMeta(UNREADABLE_META_KEY)
}

function migrateLegacyDecks(decks: GuestDeck[], unreadableEntries: unknown[]) {
  try {
    localCardDb.transaction(() => {
      for (const deck of decks) {
        localCardDb.upsertGuestDeck(
          deck.localId,
          deck.deckKey,
          deck.updatedAt,
          JSON.stringify(deck),
        )
      }
      persistUnreadable(unreadableEntries)
    })
  } catch {
    reportStorageFailure("save")
    return false
  }
  return clearLegacyKeys()
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
  pendingLegacy = store.legacy && !migrateLegacyDecks(store.decks, unreadable)
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

function commitUpsert(next: GuestDeck, decks: GuestDeck[], failure: string) {
  try {
    localCardDb.transaction(() => {
      if (pendingLegacy) {
        for (const deck of decks) {
          localCardDb.upsertGuestDeck(
            deck.localId,
            deck.deckKey,
            deck.updatedAt,
            JSON.stringify(deck),
          )
        }
        persistUnreadable(unreadable)
      } else {
        localCardDb.upsertGuestDeck(
          next.localId,
          next.deckKey,
          next.updatedAt,
          JSON.stringify(next),
        )
      }
    })
  } catch {
    reportStorageFailure("save")
    throw new GuestDeckStorageError(failure)
  }
  snapshot = decks
  if (pendingLegacy && clearLegacyKeys()) pendingLegacy = false
  notify()
}

function commitDelete(localId: string, decks: GuestDeck[], failure: string) {
  try {
    localCardDb.transaction(() => {
      if (pendingLegacy) {
        for (const deck of decks) {
          localCardDb.upsertGuestDeck(
            deck.localId,
            deck.deckKey,
            deck.updatedAt,
            JSON.stringify(deck),
          )
        }
        persistUnreadable(unreadable)
      }
      localCardDb.deleteGuestDeck(localId)
    })
  } catch {
    reportStorageFailure("save")
    throw new GuestDeckStorageError(failure)
  }
  snapshot = decks
  if (pendingLegacy && clearLegacyKeys()) pendingLegacy = false
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
    version?: number
    versions?: readonly NewGuestDeckVersion[]
    bringing?: number
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
  const versions = previous?.versions
    ? guestDeckVersions(previous).map((version) =>
        version.number === (options.version ?? latestNumber(previous))
          ? { ...version, cards: deck.cards, updatedAt }
          : version,
      )
    : options.versions?.map((version, index) => ({
        ...version,
        number: version.number ?? index + 1,
        createdAt: updatedAt,
        updatedAt,
      }))
  if (
    options.version !== undefined &&
    !versions?.some((version) => version.number === options.version) &&
    !(options.version === 1 && !previous?.versions)
  )
    throw new GuestDeckStorageError("Guest deck version does not exist.")
  const next = withVersions(
    {
      schemaVersion: 1,
      localId,
      deckKey,
      guestLocalId: previous?.guestLocalId ?? options.guestLocalId,
      movedFromAccount: previous?.movedFromAccount ?? options.movedFromAccount,
      createdAt: previous?.createdAt ?? updatedAt,
      updatedAt,
      deck,
      bringing: previous?.bringing ?? options.bringing,
    },
    versions,
  )
  if (!isGuestDeck(next)) throw new GuestDeckStorageError(translate("decks:guestStorage.invalid"))
  commitUpsert(
    next,
    previous
      ? decks.map((candidate) => (candidate.localId === previous.localId ? next : candidate))
      : [...decks, next],
    translate("decks:guestStorage.saveFailed"),
  )
  return next
}

export function guestDeckVersions(stored: GuestDeck): GuestDeckVersion[] {
  const versions = stored.versions ?? [
    {
      number: 1,
      name: DEFAULT_VERSION_NAME,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    },
  ]
  return versions.map((version, index) => ({
    ...version,
    cards: index === versions.length - 1 ? stored.deck.cards : (version.cards ?? []),
  }))
}

function latestNumber(stored: GuestDeck) {
  return stored.versions?.at(-1)?.number ?? 1
}

export function guestDeckBringing(stored: GuestDeck) {
  return stored.versions?.some((version) => version.number === stored.bringing)
    ? (stored.bringing ?? latestNumber(stored))
    : latestNumber(stored)
}

export function guestDeckPlayCards(stored: GuestDeck) {
  const bringing = guestDeckBringing(stored)
  return (
    guestDeckVersions(stored).find((version) => version.number === bringing)?.cards ??
    stored.deck.cards
  )
}

function withVersions(stored: GuestDeck, versions: readonly GuestDeckVersion[] | undefined) {
  const latest = versions?.at(-1)
  if (!versions || !latest) return stored
  return {
    ...stored,
    deck: { ...stored.deck, cards: latest.cards },
    versions: versions.map(({ cards, ...version }) =>
      version.number === latest.number ? version : { ...version, cards },
    ),
  }
}

function changeVersions(
  localId: string,
  change: (versions: GuestDeckVersion[], updatedAt: number) => GuestDeckVersion[],
  bringing?: (stored: GuestDeck) => number | undefined,
) {
  const decks = writableDecks()
  const stored = decks.find((candidate) => candidate.localId === localId)
  if (!stored) throw new GuestDeckStorageError("Guest deck localId does not match a saved deck.")
  const updatedAt = Math.max(Date.now(), stored.updatedAt + 1)
  const next = withVersions({ ...stored, updatedAt }, change(guestDeckVersions(stored), updatedAt))
  const settled = bringing ? { ...next, bringing: bringing(next) } : next
  if (!isGuestDeck(settled))
    throw new GuestDeckStorageError(translate("decks:guestStorage.invalid"))
  commitUpsert(
    settled,
    decks.map((candidate) => (candidate.localId === localId ? settled : candidate)),
    translate("decks:guestStorage.saveFailed"),
  )
  return settled
}

export function addGuestDeckVersion(
  localId: string,
  version: Omit<NewGuestDeckVersion, "number">,
  limit: number,
) {
  return changeVersions(localId, (versions, updatedAt) => {
    if (versions.length >= limit)
      throw new GuestDeckStorageError(translate("decks:detail.versionLimit", { count: limit }))
    return [
      ...versions,
      {
        number: Math.max(...versions.map((existing) => existing.number)) + 1,
        name: version.name.trim(),
        ...(version.note?.trim() ? { note: version.note.trim() } : {}),
        createdAt: updatedAt,
        updatedAt,
        cards: version.cards,
      },
    ]
  })
}

export function updateGuestDeckVersion(
  localId: string,
  number: number,
  { name, note }: { name?: string; note: string },
) {
  return changeVersions(localId, (versions, updatedAt) =>
    versions.map((version) => {
      if (version.number !== number) return version
      const { note: _previous, ...rest } = version
      return {
        ...rest,
        ...(name === undefined ? {} : { name: name.trim() }),
        ...(note.trim() ? { note: note.trim() } : {}),
        updatedAt,
      }
    }),
  )
}

export function deleteGuestDeckVersion(localId: string, number: number) {
  return changeVersions(
    localId,
    (versions) => {
      if (versions.length <= 1)
        throw new GuestDeckStorageError(translate("decks:detail.deleteVersionFailed"))
      return versions.filter((version) => version.number !== number)
    },
    (next) => (next.bringing === number ? undefined : next.bringing),
  )
}

// why: the pick is not part of the list the account copy is compared against, so it leaves updatedAt alone and a sync in flight still acknowledges.
export function setGuestDeckBringing(localId: string, number: number) {
  const decks = writableDecks()
  const stored = decks.find((candidate) => candidate.localId === localId)
  if (!stored || !guestDeckVersions(stored).some((version) => version.number === number))
    throw new GuestDeckStorageError("Guest deck version does not exist.")
  const next = { ...stored, bringing: number }
  commitUpsert(
    next,
    decks.map((candidate) => (candidate.localId === localId ? next : candidate)),
    translate("decks:guestStorage.saveFailed"),
  )
}

export function deleteGuestDeck(localId: string) {
  const decks = writableDecks()
  commitDelete(
    localId,
    decks.filter((deck) => deck.localId !== localId),
    translate("decks:guestStorage.deleteFailed"),
  )
}

export function clearGuestDecks() {
  try {
    localCardDb.clearGuestDecks()
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
