import { ConvexError } from "convex/values"

import { deckFingerprint } from "./deckFingerprint"
import { MAX_DECK_CARDS } from "./policy"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

export function assertDeckKey(key: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(key))
    throw new ConvexError({
      code: "invalid_deck_key",
      message: "Deck key must be 1–128 letters, digits, underscores or hyphens",
    })
  return key
}

export function assertDeckFingerprint(fingerprint: string) {
  if (!/^v1:[0-9a-f]{64}$/.test(fingerprint))
    throw new ConvexError({ code: "invalid_deck_fingerprint", message: "Invalid deck fingerprint" })
  return fingerprint
}

export async function versionFingerprint(
  ctx: QueryCtx,
  versionId: Id<"deckVersions">,
  game: string | undefined,
) {
  const cards = await ctx.db
    .query("deckCards")
    .withIndex("by_deck_version", (q) => q.eq("deckVersionId", versionId))
    .take(MAX_DECK_CARDS + 1)
  if (cards.length > MAX_DECK_CARDS) throw new Error("Deck has too many cards")
  return await deckFingerprint(cards.map((card) => ({ ...card, game: card.game ?? game ?? "mtg" })))
}

export async function pinnedDeck(ctx: MutationCtx, versionId: Id<"deckVersions">) {
  const version = await ctx.db.get(versionId)
  const deck = version ? await ctx.db.get(version.deckId) : null
  if (!deck) return {}
  return {
    deckKey: deck.deckKey,
    deckFingerprint: await versionFingerprint(ctx, versionId, deck.game),
  }
}

export async function findDeckByKey(ctx: QueryCtx, userId: Id<"users">, key: string) {
  assertDeckKey(key)
  return await ctx.db
    .query("decks")
    .withIndex("by_owner_and_deck_key", (q) => q.eq("ownerUserId", userId).eq("deckKey", key))
    .unique()
}

export async function deckForKey(ctx: MutationCtx, userId: Id<"users">, key: string) {
  const deck = await findDeckByKey(ctx, userId, key)
  if (deck && deck.archivedAt === undefined)
    throw new ConvexError({
      code: "deck_key_conflict",
      message: "A live deck already uses this key",
    })
  return deck
}

export async function createOrReviveDeck(
  ctx: MutationCtx,
  fields: Omit<Doc<"decks">, "_id" | "_creationTime" | "deckKey">,
  key?: string,
) {
  if (key !== undefined) assertDeckKey(key)
  const existing = key !== undefined ? await deckForKey(ctx, fields.ownerUserId, key) : null
  if (existing) {
    await ctx.db.patch(existing._id, {
      ...fields,
      archivedAt: undefined,
      movedToDeviceAt: undefined,
      unsyncedAt: undefined,
      note: fields.note,
      syncRevision: (existing.syncRevision ?? 0) + 1,
      createdAt: existing.createdAt,
    })
    return existing._id
  }
  return await ctx.db.insert("decks", { ...fields, deckKey: key ?? crypto.randomUUID() })
}
