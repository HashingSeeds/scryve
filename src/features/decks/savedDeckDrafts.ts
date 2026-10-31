import { load, remove, save } from "@/utils/storage"

import type { DeckDraft } from "./deckDraft"
import { isGuestDeckPayload, type GuestDeckPayload } from "./guestDeck"
import type { Id } from "../../../convex/_generated/dataModel"

type VersionTarget = { versionId: Id<"deckVersions">; expectedRevision: number }

export type SavedAccountDraft = {
  draft: DeckDraft
  versionId?: Id<"deckVersions">
  pinned?: VersionTarget
}

export type SavedLocalDraft = {
  deck: GuestDeckPayload
  base: GuestDeckPayload
  revision: { localId: string; updatedAt: number }
  version?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isCards(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every(
      (card) =>
        isRecord(card) && typeof card.name === "string" && Number.isSafeInteger(card.quantity),
    )
  )
}

function isDraft(value: unknown): value is DeckDraft {
  return (
    isRecord(value) &&
    value.editing === true &&
    isCards(value.cards) &&
    isCards(value.base) &&
    typeof value.note === "string" &&
    (value.metadataRevision === undefined || Number.isSafeInteger(value.metadataRevision)) &&
    typeof value.fromCache === "boolean" &&
    typeof value.commanderSelected === "boolean"
  )
}

function isVersionTarget(value: unknown): value is VersionTarget {
  return (
    isRecord(value) &&
    typeof value.versionId === "string" &&
    Number.isSafeInteger(value.expectedRevision)
  )
}

function accountKey(ownerId: string | undefined, deckId: string) {
  return `scryve.decks.draft.v1.${ownerId ?? "signed-out"}.${deckId}`
}

function localKey(localId: string) {
  return `scryve.decks.localDraft.v1.${localId}`
}

function isSavedAccountDraft(value: unknown): value is SavedAccountDraft {
  return (
    isRecord(value) &&
    isDraft(value.draft) &&
    (value.versionId === undefined || typeof value.versionId === "string") &&
    (value.pinned === undefined || isVersionTarget(value.pinned))
  )
}

export function loadAccountDraft(ownerId: string | undefined, deckId: string) {
  const value = load(accountKey(ownerId, deckId))
  return isSavedAccountDraft(value) ? value : undefined
}

export function keepAccountDraft(
  ownerId: string | undefined,
  deckId: string,
  saved: SavedAccountDraft,
) {
  save(accountKey(ownerId, deckId), { ...saved, draft: { ...saved.draft, undo: undefined } })
}

export function forgetAccountDraft(ownerId: string | undefined, deckId: string) {
  remove(accountKey(ownerId, deckId))
}

function isSavedLocalDraft(value: unknown, localId: string): value is SavedLocalDraft {
  return (
    isRecord(value) &&
    isGuestDeckPayload(value.deck) &&
    isGuestDeckPayload(value.base) &&
    isRecord(value.revision) &&
    value.revision.localId === localId &&
    Number.isSafeInteger(value.revision.updatedAt) &&
    (value.version === undefined || Number.isSafeInteger(value.version))
  )
}

export function loadLocalDraft(localId: string) {
  const value = load(localKey(localId))
  return isSavedLocalDraft(value, localId) ? value : undefined
}

export function keepLocalDraft(localId: string, saved: SavedLocalDraft) {
  save(localKey(localId), saved)
}

export function forgetLocalDraft(localId: string) {
  remove(localKey(localId))
}
