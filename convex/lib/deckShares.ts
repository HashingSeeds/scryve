import { ConvexError } from "convex/values"

import { DEFAULT_DECK_GAME } from "./deckGames"
import { versionFingerprint } from "./deckKeys"
import { deckStartingValue } from "./deckStartingValue"
import { deckIdentityOf, type DeckLabel } from "./opponentDecks"
import { MAX_DECK_VERSIONS } from "./policy"
import type { Doc, Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"

export const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/
export const SHARED_DECK_KEY = /^shared-[0-9a-f]{32}$/

export const isSharedDeckKey = (key: string | undefined): key is string =>
  key !== undefined && SHARED_DECK_KEY.test(key)

/** why: results travel to opponents with the deck key, so the key is a hash that cannot open the link. */
export async function sharedDeckKey(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
  return `shared-${hex.join("").slice(0, 32)}`
}

/** why: a link shows the version its owner brings, or the latest one when none is chosen. */
export async function sharedDeckVersion(ctx: QueryCtx, token: string) {
  if (!SHARE_TOKEN.test(token)) return null
  const link = await ctx.db
    .query("deckShares")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique()
  const deck = link ? await ctx.db.get(link.deckId) : null
  if (!deck || deck.archivedAt !== undefined) return null
  const versions = await ctx.db
    .query("deckVersions")
    .withIndex("by_deck_and_archived_at", (q) =>
      q.eq("deckId", deck._id).eq("archivedAt", undefined),
    )
    .take(MAX_DECK_VERSIONS * 4)
  const version =
    versions.find((candidate) => candidate._id === deck.bringingVersionId) ??
    versions.reduce<Doc<"deckVersions"> | undefined>(
      (latest, candidate) =>
        !latest || candidate.versionNumber > latest.versionNumber ? candidate : latest,
      undefined,
    )
  return version ? { deck, version } : null
}

export type SharedSeatDeck =
  | { kind: "owned"; deck: Doc<"decks">; version: Doc<"deckVersions"> }
  | {
      kind: "shared"
      deckKey: string
      deckFingerprint: string
      deckLabel: DeckLabel
      startingValue?: number
    }

/**
 * why: a seat playing someone else's shared deck copies its key, list and label, so the owner's
 * ids, deck key and stats never reach the game. The owner opening their own link plays their deck.
 */
export async function sharedSeatDeck(
  ctx: QueryCtx,
  token: string,
  userId: Id<"users">,
  [system, format]: readonly [string, string | undefined],
): Promise<SharedSeatDeck> {
  const shared = await sharedDeckVersion(ctx, token)
  if (!shared)
    throw new ConvexError({
      code: "shared_deck_not_found",
      message: "This deck is no longer shared",
    })
  const { deck, version } = shared
  if ((deck.game ?? DEFAULT_DECK_GAME) !== system)
    throw new ConvexError({
      code: "deck_system_mismatch",
      message: "This deck belongs to another game system",
    })
  if (deck.format !== format)
    throw new ConvexError({
      code: "deck_format_mismatch",
      message: "Choose a deck matching the lobby format",
    })
  if (deck.ownerUserId === userId) return { kind: "owned", deck, version }
  const deckKey = await sharedDeckKey(token)
  const deckFingerprint = await versionFingerprint(ctx, version._id, system)
  const identity = await deckIdentityOf(ctx, version._id, system, format)
  const startingValue = await deckStartingValue(ctx, version._id, system, format)
  return {
    kind: "shared",
    deckKey,
    deckFingerprint,
    deckLabel: {
      deckKey,
      fingerprint: deckFingerprint,
      name: deck.name,
      ...(identity ? { identity } : {}),
    },
    ...(startingValue === undefined ? {} : { startingValue }),
  }
}
