import { ConvexError, v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { requireSeatOwner, requireUser } from "./lib/auth"
import { assertDeckGame, DEFAULT_DECK_GAME } from "./lib/deckGames"
import { deckCapacity, hasFeature, PREMIUM_FEATURES, requireDeckCapacity } from "./lib/entitlements"
import { assertDeckFormat, assertDeckName, MAX_DECK_CARDS, MAX_PREMIUM_DECKS } from "./lib/policy"

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

async function ownedDeck(ctx: QueryCtx | MutationCtx, deckId: Id<"decks">) {
  const user = await requireUser(ctx)
  const deck = await ctx.db.get(deckId)
  if (!deck || deck.ownerUserId !== user._id)
    throw new ConvexError({ code: "deck_not_found", message: "Deck not found" })
  return { user, deck }
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

async function insertDeckVersion(
  ctx: MutationCtx,
  deckId: Id<"decks">,
  versionNumber: number,
  cards: DeckCardInput[],
  now: number,
) {
  const versionId = await ctx.db.insert("deckVersions", {
    deckId,
    versionNumber,
    fingerprint: fingerprint(cards),
    createdAt: now,
  })
  for (const card of cards)
    await ctx.db.insert("deckCards", {
      deckVersionId: versionId,
      oracleId: card.oracleId,
      scryfallId: card.scryfallId,
      name: card.name.trim(),
      ...(card.imageUrl ? { imageUrl: card.imageUrl } : {}),
      ...(card.smallImageUrl ? { smallImageUrl: card.smallImageUrl } : {}),
      quantity: card.quantity,
      board: card.board,
    })
  return versionId
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

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const capacity = await deckCapacity(ctx, user)
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
          const version = await ctx.db
            .query("deckVersions")
            .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", deck._id))
            .order("desc")
            .first()
          return {
            ...deck,
            game: deck.game ?? DEFAULT_DECK_GAME,
            latestVersionId: version?._id,
            versionNumber: version?.versionNumber,
            coverImageUrl: version ? await deckCoverImageUrl(ctx, version._id) : undefined,
          }
        }),
    )
    return { decks, capacity }
  },
})

export const create = mutation({
  args: { name: v.string(), format: v.string(), game: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await requireDeckCapacity(ctx, user)
    const now = Date.now()
    return await ctx.db.insert("decks", {
      ownerUserId: user._id,
      name: assertDeckName(args.name),
      format: assertDeckFormat(args.format),
      game: assertDeckGame(args.game ?? DEFAULT_DECK_GAME),
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const importResolved = mutation({
  args: {
    name: v.string(),
    format: v.string(),
    game: v.optional(v.string()),
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

    const now = Date.now()
    const deckId = await ctx.db.insert("decks", {
      ownerUserId: user._id,
      name: assertDeckName(args.name),
      format: assertDeckFormat(args.format),
      game: assertDeckGame(args.game ?? DEFAULT_DECK_GAME),
      createdAt: now,
      updatedAt: now,
    })
    await insertDeckVersion(ctx, deckId, 1, args.cards, now)
    return deckId
  },
})

export const detail = query({
  args: { deckId: v.id("decks") },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    const version = await ctx.db
      .query("deckVersions")
      .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", deck._id))
      .order("desc")
      .first()
    const cards = version
      ? await ctx.db
          .query("deckCards")
          .withIndex("by_deck_version", (q) => q.eq("deckVersionId", version._id))
          .take(MAX_DECK_CARDS + 1)
      : []
    return {
      deck: { ...deck, game: deck.game ?? DEFAULT_DECK_GAME },
      version,
      cards: cards.slice(0, MAX_DECK_CARDS),
    }
  },
})

export const saveVersion = mutation({
  args: { deckId: v.id("decks"), cards: v.array(cardValidator) },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    assertNotArchived(deck)
    assertDeckSize(args.cards)
    const latest = await ctx.db
      .query("deckVersions")
      .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", deck._id))
      .order("desc")
      .first()
    if (latest?.fingerprint === fingerprint(args.cards)) return latest._id
    const now = Date.now()
    const versionId = await insertDeckVersion(
      ctx,
      deck._id,
      (latest?.versionNumber ?? 0) + 1,
      args.cards,
      now,
    )
    await ctx.db.patch(deck._id, { updatedAt: now })
    return versionId
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
    const version = await ctx.db.get(args.deckVersionId)
    if (!version)
      throw new ConvexError({ code: "deck_version_not_found", message: "Deck version not found" })
    const { deck } = await ownedDeck(ctx, version.deckId)
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
    const stats = await ctx.db
      .query("deckStats")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .unique()
    return {
      locked: false as const,
      ...(stats ?? { deckId: deck._id, games: 0, wins: 0, losses: 0, draws: 0, unknown: 0 }),
    }
  },
})
