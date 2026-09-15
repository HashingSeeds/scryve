import { v } from "convex/values"

import { DEFAULT_DECK_GAME } from "./deckGames"
import type { Doc } from "../_generated/dataModel"

export const syncedDeckValidator = v.object({
  id: v.string(),
  deckId: v.id("decks"),
  revision: v.number(),
  name: v.string(),
  format: v.string(),
  game: v.string(),
  note: v.string(),
  deleted: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export function syncedDeck(deck: Doc<"decks">) {
  return {
    id: deck.syncId ?? deck._id,
    deckId: deck._id,
    revision: deck.syncRevision ?? 0,
    name: deck.name,
    format: deck.format,
    game: deck.game ?? DEFAULT_DECK_GAME,
    note: deck.note ?? "",
    deleted: deck.archivedAt !== undefined,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
  }
}

export const syncedVersionValidator = v.object({
  deckId: v.id("decks"),
  versionId: v.id("deckVersions"),
  revision: v.number(),
  versionNumber: v.number(),
  name: v.string(),
  note: v.string(),
  fingerprint: v.string(),
  cardCount: v.number(),
  cardQuantity: v.number(),
  deleted: v.boolean(),
  updatedAt: v.number(),
})

export function syncedVersion(version: Doc<"deckVersions">) {
  return {
    deckId: version.deckId,
    versionId: version._id,
    revision: version.syncRevision ?? 0,
    versionNumber: version.versionNumber,
    name: version.name ?? "",
    note: version.note ?? "",
    fingerprint: version.fingerprint,
    cardCount: version.cardCount ?? 0,
    cardQuantity: version.cardQuantity ?? 0,
    deleted: version.archivedAt !== undefined,
    updatedAt: version.updatedAt ?? version.createdAt,
  }
}
