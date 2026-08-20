import { ConvexError, v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { requireSeatOwner, requireUser } from "./lib/auth"
import { assertPlayableDeckGame, DEFAULT_DECK_GAME } from "./lib/deckGames"
import { DEFAULT_VERSION_NAME } from "./lib/deckVersions"
import {
  deckCapacity,
  deckVersionCapacity,
  hasFeature,
  PREMIUM_FEATURES,
  requireDeckCapacity,
  requireVersionCapacity,
} from "./lib/entitlements"
import {
  assertDeckFormat,
  assertDeckName,
  assertDeckNote,
  assertVersionName,
  MAX_DECK_CARDS,
  MAX_DECK_VERSIONS,
  MAX_PREMIUM_DECKS,
} from "./lib/policy"

const boardValidator = v.union(v.literal("main"), v.literal("sideboard"), v.literal("commander"))
const cardValidator = v.object({
  oracleId: v.string(),
  scryfallId: v.string(),
  name: v.string(),
  imageUrl: v.optional(v.string()),
  smallImageUrl: v.optional(v.string()),
  quantity: v.number(),
  board: boardValidator,
})

type DeckCardInput = {
  oracleId: string
  scryfallId: string
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
  board: "main" | "sideboard" | "commander"
}

const VERSION_SCAN = MAX_DECK_VERSIONS * 4

async function ownedDeck(ctx: QueryCtx | MutationCtx, deckId: Id<"decks">) {
  const user = await requireUser(ctx)
  const deck = await ctx.db.get(deckId)
  if (!deck || deck.ownerUserId !== user._id)
    throw new ConvexError({ code: "deck_not_found", message: "Deck not found" })
  return { user, deck }
}

async function ownedVersion(ctx: QueryCtx | MutationCtx, versionId: Id<"deckVersions">) {
  const version = await ctx.db.get(versionId)
  if (!version || version.archivedAt !== undefined)
    throw new ConvexError({ code: "deck_version_not_found", message: "Deck version not found" })
  const { user, deck } = await ownedDeck(ctx, version.deckId)
  return { user, deck, version }
}

function assertCardImage(imageUrl: string) {
  const parsed = new URL(imageUrl)
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new ConvexError({
      code: "invalid_card_image",
      message: "Card image must be a public HTTPS URL",
    })
}

function assertCard(card: {
  oracleId: string
  scryfallId: string
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
}) {
  if (!/^[0-9a-f-]{36}$/i.test(card.oracleId) || !/^[0-9a-f-]{36}$/i.test(card.scryfallId))
    throw new ConvexError({ code: "invalid_card", message: "Card identifiers are invalid" })
  if (card.name.trim().length < 1 || card.name.trim().length > 200)
    throw new ConvexError({ code: "invalid_card_name", message: "Card name is invalid" })
  if (!Number.isInteger(card.quantity) || card.quantity < 1 || card.quantity > 999)
    throw new ConvexError({ code: "invalid_card_quantity", message: "Card quantity must be 1–999" })
  if (card.imageUrl) assertCardImage(card.imageUrl)
  if (card.smallImageUrl) assertCardImage(card.smallImageUrl)
}

function assertDeckSize(cards: DeckCardInput[]) {
  if (cards.length > MAX_DECK_CARDS)
    throw new ConvexError({
      code: "deck_too_large",
      message: `A deck may contain at most ${MAX_DECK_CARDS} entries`,
    })
  for (const card of cards) assertCard(card)
}

function fingerprint(
  cards: Array<{ oracleId: string; scryfallId: string; quantity: number; board: string }>,
) {
  const canonical = cards
    .map((card) => `${card.board}:${card.oracleId}:${card.scryfallId}:${card.quantity}`)
    .sort()
    .join("|")
  let hash = 2166136261
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${cards.length}-${(hash >>> 0).toString(16).padStart(8, "0")}`
}

function cardTotals(cards: DeckCardInput[]) {
  return {
    fingerprint: fingerprint(cards),
    cardCount: cards.length,
    cardQuantity: cards.reduce((total, card) => total + card.quantity, 0),
  }
}

function cardRow(versionId: Id<"deckVersions">, card: DeckCardInput) {
  return {
    deckVersionId: versionId,
    oracleId: card.oracleId,
    scryfallId: card.scryfallId,
    name: card.name.trim(),
    ...(card.imageUrl ? { imageUrl: card.imageUrl } : {}),
    ...(card.smallImageUrl ? { smallImageUrl: card.smallImageUrl } : {}),
    quantity: card.quantity,
    board: card.board,
  }
}

async function insertDeckVersion(
  ctx: MutationCtx,
  deckId: Id<"decks">,
  version: { versionNumber: number; name: string; note?: string },
  cards: DeckCardInput[],
  now: number,
) {
  const versionId = await ctx.db.insert("deckVersions", {
    deckId,
    versionNumber: version.versionNumber,
    name: assertVersionName(version.name),
    ...(version.note ? { note: assertDeckNote(version.note) } : {}),
    ...cardTotals(cards),
    createdAt: now,
    updatedAt: now,
  })
  for (const card of cards) await ctx.db.insert("deckCards", cardRow(versionId, card))
  return versionId
}

async function replaceVersionCards(
  ctx: MutationCtx,
  versionId: Id<"deckVersions">,
  cards: DeckCardInput[],
) {
  const existing = await ctx.db
    .query("deckCards")
    .withIndex("by_deck_version", (q) => q.eq("deckVersionId", versionId))
    .take(MAX_DECK_CARDS + 1)
  for (const card of existing) await ctx.db.delete(card._id)
  for (const card of cards) await ctx.db.insert("deckCards", cardRow(versionId, card))
}

const DECK_COVER_SCAN = 20

async function deckCoverImageUrl(ctx: QueryCtx, deckVersionId: Id<"deckVersions">) {
  const cards = await ctx.db
    .query("deckCards")
    .withIndex("by_deck_version", (q) => q.eq("deckVersionId", deckVersionId))
    .take(DECK_COVER_SCAN)
  const covers = cards.filter((card) => coverCandidate(card) !== undefined)
  const illustrated = covers.find((card) => card.board === "commander") ?? covers[0]
  return illustrated ? coverCandidate(illustrated) : undefined
}

function coverCandidate(card: Doc<"deckCards">) {
  return card.smallImageUrl ?? card.imageUrl
}

function assertNotArchived(deck: Doc<"decks">) {
  if (deck.archivedAt !== undefined)
    throw new ConvexError({ code: "deck_archived", message: "This deck was deleted" })
}

async function activeVersions(ctx: QueryCtx | MutationCtx, deckId: Id<"decks">) {
  const versions = await ctx.db
    .query("deckVersions")
    .withIndex("by_deck_and_archived_at", (q) => q.eq("deckId", deckId).eq("archivedAt", undefined))
    .take(VERSION_SCAN)
  return versions.sort((left, right) => left.versionNumber - right.versionNumber)
}

const EMPTY_RECORD = { games: 0, wins: 0, losses: 0, draws: 0, unknown: 0 }

async function versionRecord(ctx: QueryCtx, deckVersionId: Id<"deckVersions">) {
  const stats = await ctx.db
    .query("deckVersionStats")
    .withIndex("by_version", (q) => q.eq("deckVersionId", deckVersionId))
    .unique()
  return {
    games: stats?.games ?? 0,
    wins: stats?.wins ?? 0,
    losses: stats?.losses ?? 0,
    draws: stats?.draws ?? 0,
    unknown: stats?.unknown ?? 0,
  }
}

async function deckRecord(ctx: QueryCtx, deckId: Id<"decks">) {
  const stats = await ctx.db
    .query("deckStats")
    .withIndex("by_deck", (q) => q.eq("deckId", deckId))
    .unique()
  return stats
    ? {
        games: stats.games,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        unknown: stats.unknown,
      }
    : EMPTY_RECORD
}

async function lastPlayedAt(ctx: QueryCtx, deckId: Id<"decks">) {
  const result = await ctx.db
    .query("deckGameResults")
    .withIndex("by_deck_and_finished_at", (q) => q.eq("deckId", deckId))
    .order("desc")
    .first()
  return result?.finishedAt
}

function publicDeck(deck: Doc<"decks">) {
  return { ...deck, game: deck.game ?? DEFAULT_DECK_GAME }
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const [capacity, analytics] = await Promise.all([
      deckCapacity(ctx, user),
      hasFeature(ctx, user, PREMIUM_FEATURES.deckAnalytics),
    ])
    const owned = await ctx.db
      .query("decks")
      .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerUserId", user._id))
      .order("desc")
      .take(MAX_PREMIUM_DECKS + 1)
    const decks = await Promise.all(
      owned
        .filter((deck) => deck.archivedAt === undefined)
        .slice(0, MAX_PREMIUM_DECKS)
        .map(async (deck) => {
          const versions = await activeVersions(ctx, deck._id)
          const latest = versions[versions.length - 1]
          return {
            ...publicDeck(deck),
            latestVersionId: latest?._id,
            versionNumber: latest?.versionNumber,
            versionCount: versions.length,
            versions: versions.map((version) => ({
              _id: version._id,
              name: version.name,
              versionNumber: version.versionNumber,
            })),
            cardQuantity: latest?.cardQuantity,
            coverImageUrl: latest ? await deckCoverImageUrl(ctx, latest._id) : undefined,
            lastPlayedAt: await lastPlayedAt(ctx, deck._id),
            record: analytics ? await deckRecord(ctx, deck._id) : undefined,
          }
        }),
    )
    return { decks, capacity, analyticsLocked: !analytics }
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    format: v.string(),
    game: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await requireDeckCapacity(ctx, user)
    const game = assertPlayableDeckGame(args.game ?? DEFAULT_DECK_GAME)
    const note = args.note ? assertDeckNote(args.note) : ""
    const now = Date.now()
    const deckId = await ctx.db.insert("decks", {
      ownerUserId: user._id,
      name: assertDeckName(args.name),
      format: assertDeckFormat(args.format),
      game,
      ...(note ? { note } : {}),
      createdAt: now,
      updatedAt: now,
    })
    await insertDeckVersion(ctx, deckId, { versionNumber: 1, name: DEFAULT_VERSION_NAME }, [], now)
    return deckId
  },
})

export const importResolved = mutation({
  args: {
    name: v.string(),
    format: v.string(),
    game: v.optional(v.string()),
    note: v.optional(v.string()),
    cards: v.array(cardValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await requireDeckCapacity(ctx, user)
    if (args.cards.length < 1)
      throw new ConvexError({
        code: "empty_import",
        message: "Import at least one resolved card",
      })
    assertDeckSize(args.cards)
    const game = assertPlayableDeckGame(args.game ?? DEFAULT_DECK_GAME)
    const note = args.note ? assertDeckNote(args.note) : ""

    const now = Date.now()
    const deckId = await ctx.db.insert("decks", {
      ownerUserId: user._id,
      name: assertDeckName(args.name),
      format: assertDeckFormat(args.format),
      game,
      ...(note ? { note } : {}),
      createdAt: now,
      updatedAt: now,
    })
    await insertDeckVersion(
      ctx,
      deckId,
      { versionNumber: 1, name: DEFAULT_VERSION_NAME },
      args.cards,
      now,
    )
    return deckId
  },
})

export const update = mutation({
  args: {
    deckId: v.id("decks"),
    name: v.optional(v.string()),
    format: v.optional(v.string()),
    game: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    assertNotArchived(deck)
    const game = args.game === undefined ? undefined : assertPlayableDeckGame(args.game)
    const note = args.note === undefined ? undefined : assertDeckNote(args.note)
    await ctx.db.patch(deck._id, {
      ...(args.name === undefined ? {} : { name: assertDeckName(args.name) }),
      ...(args.format === undefined ? {} : { format: assertDeckFormat(args.format) }),
      ...(game === undefined ? {} : { game }),
      ...(note === undefined ? {} : { note }),
      updatedAt: Date.now(),
    })
    return null
  },
})

export const detail = query({
  args: { deckId: v.id("decks"), versionId: v.optional(v.id("deckVersions")) },
  handler: async (ctx, args) => {
    const { user, deck } = await ownedDeck(ctx, args.deckId)
    const analytics = await hasFeature(ctx, user, PREMIUM_FEATURES.deckAnalytics)
    const stored = await activeVersions(ctx, deck._id)
    const versions = await Promise.all(
      stored.map(async (version) => ({
        _id: version._id,
        versionNumber: version.versionNumber,
        name: version.name,
        note: version.note,
        cardCount: version.cardCount ?? 0,
        cardQuantity: version.cardQuantity ?? 0,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt ?? version.createdAt,
        record: analytics ? await versionRecord(ctx, version._id) : undefined,
      })),
    )
    const selected =
      stored.find((version) => version._id === args.versionId) ?? stored[stored.length - 1]
    const cards = selected
      ? await ctx.db
          .query("deckCards")
          .withIndex("by_deck_version", (q) => q.eq("deckVersionId", selected._id))
          .take(MAX_DECK_CARDS + 1)
      : []
    return {
      deck: publicDeck(deck),
      versions,
      version: selected ?? null,
      cards: cards.slice(0, MAX_DECK_CARDS),
      capacity: await deckVersionCapacity(ctx, user, stored.length),
      record: analytics ? await deckRecord(ctx, deck._id) : undefined,
      analyticsLocked: !analytics,
    }
  },
})

export const saveVersion = mutation({
  args: {
    deckId: v.id("decks"),
    versionId: v.optional(v.id("deckVersions")),
    cards: v.array(cardValidator),
  },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    assertNotArchived(deck)
    assertDeckSize(args.cards)
    const versions = await activeVersions(ctx, deck._id)
    const target = args.versionId
      ? versions.find((version) => version._id === args.versionId)
      : versions[versions.length - 1]
    const now = Date.now()
    if (!target) {
      const versionId = await insertDeckVersion(
        ctx,
        deck._id,
        { versionNumber: 1, name: DEFAULT_VERSION_NAME },
        args.cards,
        now,
      )
      await ctx.db.patch(deck._id, { updatedAt: now })
      return versionId
    }
    const totals = cardTotals(args.cards)
    if (target.fingerprint === totals.fingerprint) return target._id
    await replaceVersionCards(ctx, target._id, args.cards)
    await ctx.db.patch(target._id, { ...totals, updatedAt: now })
    await ctx.db.patch(deck._id, { updatedAt: now })
    return target._id
  },
})

export const createVersion = mutation({
  args: {
    deckId: v.id("decks"),
    fromVersionId: v.optional(v.id("deckVersions")),
    name: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, deck } = await ownedDeck(ctx, args.deckId)
    assertNotArchived(deck)
    const versions = await activeVersions(ctx, deck._id)
    await requireVersionCapacity(ctx, user, versions.length)
    const source = args.fromVersionId
      ? versions.find((version) => version._id === args.fromVersionId)
      : undefined
    if (args.fromVersionId && !source)
      throw new ConvexError({ code: "deck_version_not_found", message: "Deck version not found" })
    const cards = source
      ? (
          await ctx.db
            .query("deckCards")
            .withIndex("by_deck_version", (q) => q.eq("deckVersionId", source._id))
            .take(MAX_DECK_CARDS + 1)
        )
          .slice(0, MAX_DECK_CARDS)
          .map(({ _id: _, _creationTime: __, deckVersionId: ___, ...card }) => card)
      : []
    const now = Date.now()
    const versionNumber =
      versions.reduce((highest, version) => Math.max(highest, version.versionNumber), 0) + 1
    const versionId = await insertDeckVersion(
      ctx,
      deck._id,
      { versionNumber, name: args.name, ...(args.note ? { note: args.note } : {}) },
      cards,
      now,
    )
    await ctx.db.patch(deck._id, { updatedAt: now })
    return versionId
  },
})

export const updateVersion = mutation({
  args: {
    versionId: v.id("deckVersions"),
    name: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { deck, version } = await ownedVersion(ctx, args.versionId)
    assertNotArchived(deck)
    const note = args.note === undefined ? undefined : assertDeckNote(args.note)
    await ctx.db.patch(version._id, {
      ...(args.name === undefined ? {} : { name: assertVersionName(args.name) }),
      ...(note === undefined ? {} : { note }),
      updatedAt: Date.now(),
    })
    return null
  },
})

export const deleteVersion = mutation({
  args: { versionId: v.id("deckVersions") },
  handler: async (ctx, args) => {
    const { deck, version } = await ownedVersion(ctx, args.versionId)
    assertNotArchived(deck)
    const versions = await activeVersions(ctx, deck._id)
    if (versions.length <= 1)
      throw new ConvexError({
        code: "last_version",
        message: "A deck needs at least one version",
      })
    const now = Date.now()
    await ctx.db.patch(version._id, { archivedAt: now, updatedAt: now })
    await ctx.db.patch(deck._id, { updatedAt: now })
    return null
  },
})

export const archive = mutation({
  args: { deckId: v.id("decks") },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    if (deck.archivedAt !== undefined)
      throw new ConvexError({ code: "deck_already_archived", message: "Deck already deleted" })
    const now = Date.now()
    await ctx.db.patch(deck._id, { archivedAt: now, updatedAt: now })
    return null
  },
})

export const selectForSeat = mutation({
  args: { publicId: v.string(), seat: v.number(), deckVersionId: v.id("deckVersions") },
  handler: async (ctx, args) => {
    const { deck, version } = await ownedVersion(ctx, args.deckVersionId)
    assertNotArchived(deck)
    const game = await ctx.db
      .query("games")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique()
    if (!game || game.status !== "lobby")
      throw new ConvexError({
        code: "deck_selection_not_allowed",
        message: "Decks can only be selected in a lobby",
      })
    const { player } = await requireSeatOwner(ctx, game._id, args.seat)
    await ctx.db.patch(player._id, { deckVersionId: version._id })
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
    return { deckId: deck._id, deckVersionId: version._id }
  },
})

export const stats = query({
  args: { deckId: v.id("decks") },
  handler: async (ctx, args) => {
    const { user, deck } = await ownedDeck(ctx, args.deckId)
    if (!(await hasFeature(ctx, user, PREMIUM_FEATURES.deckAnalytics)))
      return { locked: true as const }
    const versions = await activeVersions(ctx, deck._id)
    return {
      locked: false as const,
      deckId: deck._id,
      ...(await deckRecord(ctx, deck._id)),
      byVersion: await Promise.all(
        versions.map(async (version) => ({
          deckVersionId: version._id,
          versionNumber: version.versionNumber,
          name: version.name,
          ...(await versionRecord(ctx, version._id)),
        })),
      ),
    }
  },
})
