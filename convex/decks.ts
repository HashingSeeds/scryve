import { paginationOptsValidator } from "convex/server"
import { ConvexError, type Infer, v } from "convex/values"

import { api } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { requireSeatOwner, requireUser } from "./lib/auth"
import { deckFingerprint } from "./lib/deckFingerprint"
import {
  assertDeckGameFormat,
  assertDeckGame,
  DEFAULT_DECK_GAME,
  magicCatalogCardFields,
  defaultDeckFormat,
} from "./lib/deckGames"
import { refreshDeckIdentity } from "./lib/deckIdentity"
import {
  assertDeckKey,
  createOrReviveDeck,
  deckForKey,
  findDeckByKey,
  pinnedDeck,
} from "./lib/deckKeys"
import { deckStartingValue } from "./lib/deckStartingValue"
import {
  syncedDeck,
  syncedDeckValidator,
  syncedVersion,
  syncedVersionValidator,
} from "./lib/deckSync"
import { DEFAULT_VERSION_NAME } from "./lib/deckVersions"
import {
  deckCapacity,
  deckVersionCapacity,
  requireDeckCapacity,
  requireVersionCapacity,
} from "./lib/entitlements"
import { limitGameRate } from "./lib/gameRateLimits"
import { GAME_PROVIDERS, isProviderGame } from "./lib/games/providers"
import {
  capabilityReleased,
  integration,
  integrationFor,
  requireReleasedCapability,
} from "./lib/integrations"
import {
  assertDeckFormat,
  assertDeckName,
  assertDeckNote,
  assertVersionName,
  MAX_DECK_CARDS,
  MAX_DECK_VERSIONS,
  MAX_PREMIUM_DECKS,
} from "./lib/policy"
import { resultDeckKey } from "./lib/results"

const boardValidator = v.union(v.literal("main"), v.literal("sideboard"), v.literal("commander"))
const cardValidator = v.object({
  game: v.optional(v.string()),
  identityNamespace: v.optional(v.string()),
  cardId: v.optional(v.string()),
  providerCardId: v.optional(v.string()),
  printingId: v.optional(v.string()),
  section: v.optional(v.string()),
  entryKind: v.optional(v.string()),
  originalReference: v.optional(v.string()),
  category: v.optional(v.string()),
  oracleId: v.optional(v.string()),
  scryfallId: v.optional(v.string()),
  name: v.string(),
  imageUrl: v.optional(v.string()),
  smallImageUrl: v.optional(v.string()),
  quantity: v.number(),
  board: v.optional(boardValidator),
  commanderColor: v.optional(
    v.union(v.literal("W"), v.literal("U"), v.literal("B"), v.literal("R"), v.literal("G")),
  ),
})

type DeckCardInput = Infer<typeof cardValidator>

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

function assertCard(
  card: {
    game?: string
    cardId?: string
    providerCardId?: string
    printingId?: string
    section?: string
    originalReference?: string
    oracleId?: string
    scryfallId?: string
    name: string
    imageUrl?: string
    smallImageUrl?: string
    quantity: number
  },
  game: string,
) {
  if (card.game !== undefined && card.game !== game)
    throw new ConvexError({
      code: "deck_system_mismatch",
      message: "Card belongs to another system",
    })
  if (game === DEFAULT_DECK_GAME) {
    if (
      !card.oracleId ||
      !card.scryfallId ||
      !/^[0-9a-f-]{36}$/i.test(card.oracleId) ||
      !/^[0-9a-f-]{36}$/i.test(card.scryfallId)
    )
      throw new ConvexError({ code: "invalid_card", message: "Card identifiers are invalid" })
  } else if (!(card.cardId || card.providerCardId || card.printingId || card.originalReference)) {
    throw new ConvexError({
      code: "invalid_card",
      message: "Card needs an identity or unresolved source reference",
    })
  }
  const section = card.section ?? (game === DEFAULT_DECK_GAME ? undefined : "main")
  if (section !== undefined && (section.trim().length < 1 || section.length > 80))
    throw new ConvexError({ code: "invalid_deck_section", message: "Deck section is invalid" })
  if (card.name.trim().length < 1 || card.name.trim().length > 200)
    throw new ConvexError({ code: "invalid_card_name", message: "Card name is invalid" })
  if (!Number.isInteger(card.quantity) || card.quantity < 1 || card.quantity > 999)
    throw new ConvexError({ code: "invalid_card_quantity", message: "Card quantity must be 1–999" })
  if (card.imageUrl) assertCardImage(card.imageUrl)
  if (card.smallImageUrl) assertCardImage(card.smallImageUrl)
}

function assertDeckSize(cards: DeckCardInput[], game: string) {
  if (cards.length > MAX_DECK_CARDS)
    throw new ConvexError({
      code: "deck_too_large",
      message: `A deck may contain at most ${MAX_DECK_CARDS} entries`,
    })
  for (const card of cards) assertCard(card, game)
}
function canonicalCardRows(cards: DeckCardInput[]) {
  return cards
    .map(
      (card) =>
        `${card.section ?? card.board ?? "main"}:${card.cardId ?? card.oracleId ?? ""}:${card.printingId ?? card.providerCardId ?? card.scryfallId ?? card.originalReference ?? ""}:${card.quantity}${card.commanderColor ? `:${card.commanderColor}` : ""}`,
    )
    .sort()
}

function fingerprint(cards: DeckCardInput[]) {
  const canonical = canonicalCardRows(cards).join("|")
  let hash = 2166136261
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${cards.length}-${(hash >>> 0).toString(16).padStart(8, "0")}`
}

function cardFields(game: string, card: DeckCardInput) {
  return {
    game,
    identityNamespace:
      card.identityNamespace ??
      (integration(game) ?? integrationFor(DEFAULT_DECK_GAME)).identityNamespace,
    ...((card.cardId ?? card.oracleId) ? { cardId: card.cardId ?? card.oracleId } : {}),
    ...((card.providerCardId ?? card.scryfallId)
      ? { providerCardId: card.providerCardId ?? card.scryfallId }
      : {}),
    ...((card.printingId ?? card.scryfallId)
      ? { printingId: card.printingId ?? card.scryfallId }
      : {}),
    section: card.section ?? card.board ?? "main",
    entryKind: card.entryKind ?? "card",
    ...(card.originalReference ? { originalReference: card.originalReference } : {}),
    ...(card.category ? { category: card.category } : {}),
    ...(card.oracleId ? { oracleId: card.oracleId } : {}),
    ...(card.scryfallId ? { scryfallId: card.scryfallId } : {}),
    name: card.name.trim(),
    ...(card.imageUrl ? { imageUrl: card.imageUrl } : {}),
    ...(card.smallImageUrl ? { smallImageUrl: card.smallImageUrl } : {}),
    quantity: card.quantity,
    ...(card.board ? { board: card.board } : {}),
    ...(card.commanderColor ? { commanderColor: card.commanderColor } : {}),
  }
}

function canonicalCardFieldsWithDefaults(game: string, card: Doc<"deckCards">) {
  const { _id: _, _creationTime: __, deckVersionId: ___, ...fields } = card
  return cardFields(card.game ?? game, fields)
}

function canonicalCards(cards: readonly Record<string, unknown>[]) {
  return JSON.stringify(
    cards
      .map((card) =>
        JSON.stringify(
          Object.fromEntries(
            Object.entries(card).sort(([left], [right]) => left.localeCompare(right)),
          ),
        ),
      )
      .sort(),
  )
}

function sameCards(game: string, left: DeckCardInput[], right: DeckCardInput[]) {
  return (
    canonicalCards(left.map((card) => cardFields(game, card))) ===
    canonicalCards(right.map((card) => cardFields(game, card)))
  )
}

function cardTotals(cards: DeckCardInput[]) {
  return {
    fingerprint: fingerprint(cards),
    cardCount: cards.length,
    cardQuantity: cards.reduce((total, card) => total + card.quantity, 0),
  }
}

function cardRow(versionId: Id<"deckVersions">, game: string, card: DeckCardInput) {
  return {
    deckVersionId: versionId,
    ...cardFields(game, card),
  }
}

async function insertDeckVersion(
  ctx: MutationCtx,
  deckId: Id<"decks">,
  game: string,
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
    syncRevision: 1,
    createdAt: now,
    updatedAt: now,
  })
  for (const card of cards) await ctx.db.insert("deckCards", cardRow(versionId, game, card))
  return versionId
}

async function writeInitialVersion(
  ctx: MutationCtx,
  deckId: Id<"decks">,
  game: string,
  cards: DeckCardInput[],
  now: number,
) {
  const latest = await ctx.db
    .query("deckVersions")
    .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", deckId))
    .order("desc")
    .first()
  if (!latest)
    return await insertDeckVersion(
      ctx,
      deckId,
      game,
      { versionNumber: 1, name: DEFAULT_VERSION_NAME },
      cards,
      now,
    )
  await replaceVersionCards(ctx, latest._id, game, cards)
  await ctx.db.patch(latest._id, {
    ...cardTotals(cards),
    archivedAt: undefined,
    updatedAt: now,
    syncRevision: (latest.syncRevision ?? 0) + 1,
  })
  return latest._id
}

const importedVersionValidator = v.object({
  name: v.string(),
  note: v.optional(v.string()),
  cards: v.array(cardValidator),
})
type ImportedVersion = Infer<typeof importedVersionValidator>

async function storedCanonicalCards(ctx: MutationCtx, game: string, versionId: Id<"deckVersions">) {
  const cards = await ctx.db
    .query("deckCards")
    .withIndex("by_deck_version", (q) => q.eq("deckVersionId", versionId))
    .take(MAX_DECK_CARDS + 1)
  return canonicalCards(cards.map((card) => canonicalCardFieldsWithDefaults(game, card)))
}

async function replaceDeckVersions(
  ctx: MutationCtx,
  deckId: Id<"decks">,
  game: string,
  versions: readonly ImportedVersion[],
  now: number,
) {
  const previous = await activeVersions(ctx, deckId)
  const previousCards = await Promise.all(
    previous.map((version) => storedCanonicalCards(ctx, game, version._id)),
  )
  const highest = await ctx.db
    .query("deckVersions")
    .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", deckId))
    .order("desc")
    .first()
  let nextNumber = (highest?.versionNumber ?? 0) + 1
  let lastNumber = 0
  const kept = new Set<Id<"deckVersions">>()
  for (const version of versions) {
    const cards = canonicalCards(version.cards.map((card) => cardFields(game, card)))
    const reusable = previous.findIndex(
      (candidate, index) =>
        !kept.has(candidate._id) &&
        candidate.versionNumber > lastNumber &&
        previousCards[index] === cards,
    )
    const reused = previous[reusable]
    if (!reused) {
      lastNumber = nextNumber
      nextNumber += 1
      await insertDeckVersion(
        ctx,
        deckId,
        game,
        { versionNumber: lastNumber, name: version.name, note: version.note },
        version.cards,
        now,
      )
      continue
    }
    kept.add(reused._id)
    lastNumber = reused.versionNumber
    const name = assertVersionName(version.name)
    const note = version.note ? assertDeckNote(version.note) : undefined
    if (reused.name !== name || reused.note !== note)
      await ctx.db.patch(reused._id, {
        name,
        note,
        syncRevision: (reused.syncRevision ?? 0) + 1,
        updatedAt: now,
      })
  }
  for (const version of previous)
    if (!kept.has(version._id))
      await ctx.db.patch(version._id, {
        archivedAt: now,
        syncRevision: (version.syncRevision ?? 0) + 1,
        updatedAt: now,
      })
}

async function replaceVersionCards(
  ctx: MutationCtx,
  versionId: Id<"deckVersions">,
  game: string,
  cards: DeckCardInput[],
) {
  const existing = await ctx.db
    .query("deckCards")
    .withIndex("by_deck_version", (q) => q.eq("deckVersionId", versionId))
    .take(MAX_DECK_CARDS + 1)
  for (const card of existing) await ctx.db.delete(card._id)
  for (const card of cards) await ctx.db.insert("deckCards", cardRow(versionId, game, card))
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

type StatsCounters = Pick<
  Doc<"deckKeyStats">,
  | "games"
  | "wins"
  | "losses"
  | "draws"
  | "unknown"
  | "manualMatches"
  | "manualGames"
  | "connectedMatches"
>

// why: top-level fields stay Scryve games for installed clients; each source gets its own envelope.
function statsRecord(stats: StatsCounters | null) {
  const games = {
    total: stats?.games ?? 0,
    wins: stats?.wins ?? 0,
    losses: stats?.losses ?? 0,
    draws: stats?.draws ?? 0,
    unknown: stats?.unknown ?? 0,
  }
  return {
    games: games.total,
    wins: games.wins,
    losses: games.losses,
    draws: games.draws,
    unknown: games.unknown,
    connected: {
      games,
      ...(stats?.connectedMatches ? { matches: stats.connectedMatches } : {}),
    },
    manual: {
      ...(stats?.manualMatches ? { matches: stats.manualMatches } : {}),
      ...(stats?.manualGames ? { games: stats.manualGames } : {}),
    },
  }
}

async function versionRecord(ctx: QueryCtx, deckVersionId: Id<"deckVersions">) {
  return statsRecord(
    await ctx.db
      .query("deckVersionStats")
      .withIndex("by_version", (q) => q.eq("deckVersionId", deckVersionId))
      .unique(),
  )
}

async function keyRecord(ctx: QueryCtx, deck: Doc<"decks">) {
  const stats = await ctx.db
    .query("deckKeyStats")
    .withIndex("by_user_and_deck_key_and_fingerprint", (q) =>
      q.eq("userId", deck.ownerUserId).eq("deckKey", deck.deckKey).eq("fingerprint", "all"),
    )
    .unique()
  return statsRecord(stats)
}

async function lastPlayedAt(ctx: QueryCtx, deck: Doc<"decks">) {
  const result = await ctx.db
    .query("deckResults")
    .withIndex("by_user_and_deck_key_and_finished_at", (q) =>
      q.eq("userId", deck.ownerUserId).eq("deckKey", deck.deckKey),
    )
    .order("desc")
    .first()
  return result?.finishedAt
}

async function versionStartingValues(
  ctx: QueryCtx,
  deck: Doc<"decks">,
  versions: readonly Doc<"deckVersions">[],
  needed: (version: Doc<"deckVersions">) => boolean = () => true,
) {
  return await Promise.all(
    versions.map(async (version) => {
      if (!needed(version)) return {}
      const startingValue = await deckStartingValue(
        ctx,
        version._id,
        deck.game ?? DEFAULT_DECK_GAME,
        deck.format,
      )
      return startingValue === undefined ? {} : { startingValue }
    }),
  )
}

function publicDeck(deck: Doc<"decks">, versions: readonly Doc<"deckVersions">[]) {
  const { bringingVersionId, ...rest } = deck
  return {
    ...rest,
    game: deck.game ?? DEFAULT_DECK_GAME,
    ...(versions.some((version) => version._id === bringingVersionId) ? { bringingVersionId } : {}),
  }
}

export const capacity = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    return await deckCapacity(ctx, user)
  },
})

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const capacity = await deckCapacity(ctx, user)
    const active = await ctx.db
      .query("decks")
      .withIndex("by_owner_and_archived_at", (q) =>
        q.eq("ownerUserId", user._id).eq("archivedAt", undefined),
      )
      .take(MAX_PREMIUM_DECKS + 1)
    const decks = await Promise.all(
      active
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, MAX_PREMIUM_DECKS)
        .map(async (deck) => {
          const versions = await activeVersions(ctx, deck._id)
          const latest = versions[versions.length - 1]
          const startingValues = await versionStartingValues(
            ctx,
            deck,
            versions,
            (version) => version === latest || version._id === deck.bringingVersionId,
          )
          const includeImages = await capabilityReleased(
            ctx,
            deck.game ?? DEFAULT_DECK_GAME,
            "images",
          )
          const record = await keyRecord(ctx, deck)
          return {
            ...publicDeck(deck, versions),
            latestVersionId: latest?._id,
            versionNumber: latest?.versionNumber,
            versionCount: versions.length,
            versions: versions.map((version, index) => ({
              _id: version._id,
              name: version.name,
              versionNumber: version.versionNumber,
              ...startingValues[index],
            })),
            cardQuantity: latest?.cardQuantity,
            startingValue: startingValues.at(-1)?.startingValue,
            coverImageUrl:
              latest && includeImages ? await deckCoverImageUrl(ctx, latest._id) : undefined,
            lastPlayedAt: await lastPlayedAt(ctx, deck),
            record,
            keyRecord: record,
          }
        }),
    )
    // eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Deck stats are free; installed clients still read the retired lock flag.
    return { ownerId: user.clerkUserId, decks, capacity, analyticsLocked: false }
  },
})

export const create = mutation({
  args: {
    deckKey: v.optional(v.string()),
    name: v.string(),
    format: v.string(),
    game: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (args.deckKey !== undefined) await deckForKey(ctx, user._id, args.deckKey)
    await requireDeckCapacity(ctx, user)
    const game = assertDeckGame(args.game ?? DEFAULT_DECK_GAME)
    await requireReleasedCapability(ctx, game, "deckImport")
    const format = assertDeckGameFormat(game, assertDeckFormat(args.format))
    const note = args.note ? assertDeckNote(args.note) : ""
    const now = Date.now()
    const deckId = await createOrReviveDeck(
      ctx,
      {
        ownerUserId: user._id,
        name: assertDeckName(args.name),
        format,
        game,
        ...(note ? { note } : {}),
        createdAt: now,
        updatedAt: now,
      },
      args.deckKey,
    )
    await writeInitialVersion(ctx, deckId, game, [], now)
    await refreshDeckIdentity(ctx, deckId)
    return deckId
  },
})

export const importResolved = mutation({
  args: {
    deckKey: v.optional(v.string()),
    name: v.string(),
    format: v.string(),
    game: v.optional(v.string()),
    note: v.optional(v.string()),
    cards: v.array(cardValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (args.deckKey !== undefined) await deckForKey(ctx, user._id, args.deckKey)
    await requireDeckCapacity(ctx, user)
    if (args.cards.length < 1)
      throw new ConvexError({
        code: "empty_import",
        message: "Import at least one resolved card",
      })
    const game = assertDeckGame(args.game ?? DEFAULT_DECK_GAME)
    await requireReleasedCapability(ctx, game, "deckImport")
    assertDeckSize(args.cards, game)
    const format = assertDeckGameFormat(game, assertDeckFormat(args.format))
    const note = args.note ? assertDeckNote(args.note) : ""

    const now = Date.now()
    const deckId = await createOrReviveDeck(
      ctx,
      {
        ownerUserId: user._id,
        name: assertDeckName(args.name),
        format,
        game,
        ...(note ? { note } : {}),
        createdAt: now,
        updatedAt: now,
      },
      args.deckKey,
    )
    await writeInitialVersion(ctx, deckId, game, args.cards, now)
    await refreshDeckIdentity(ctx, deckId)
    return deckId
  },
})

export const importGuest = mutation({
  args: {
    deckKey: v.optional(v.string()),
    movedFromAccount: v.optional(v.boolean()),
    localId: v.string(),
    localUpdatedAt: v.number(),
    name: v.string(),
    format: v.string(),
    game: v.optional(v.string()),
    note: v.optional(v.string()),
    cards: v.array(cardValidator),
    versions: v.optional(v.array(importedVersionValidator)),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (args.deckKey !== undefined) assertDeckKey(args.deckKey)
    const versions = args.versions
    if (
      versions !== undefined &&
      (versions.length < 1 ||
        versions.length > MAX_DECK_VERSIONS ||
        !sameCards(args.game ?? DEFAULT_DECK_GAME, versions[versions.length - 1].cards, args.cards))
    )
      throw new ConvexError({
        code: "invalid_versions",
        message: `Send 1–${MAX_DECK_VERSIONS} versions ending with the current cards`,
      })
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args.localId)
    )
      throw new ConvexError({ code: "invalid_local_id", message: "Guest local ID must be a UUID" })
    if (!Number.isSafeInteger(args.localUpdatedAt) || args.localUpdatedAt < 0)
      throw new ConvexError({
        code: "invalid_local_updated_at",
        message: "Guest timestamp is invalid",
      })
    const existing = await ctx.db
      .query("decks")
      .withIndex("by_owner_and_guest_local_id", (q) =>
        q.eq("ownerUserId", user._id).eq("guestLocalId", args.localId),
      )
      .unique()
    if (
      existing &&
      args.deckKey !== undefined &&
      args.deckKey !== existing.deckKey &&
      args.deckKey !== args.localId
    )
      throw new ConvexError({ code: "deck_key_conflict", message: "Deck key cannot change" })
    if (existing && (existing.archivedAt === undefined || args.deckKey === undefined)) {
      const receiptUpdatedAt = existing.guestUpdatedAt ?? null
      return {
        status: "already_imported" as const,
        deckId: existing._id,
        localUpdatedAt: receiptUpdatedAt,
      }
    }
    const live = args.deckKey ? await findDeckByKey(ctx, user._id, args.deckKey) : null
    if (args.movedFromAccount && !live && !existing) return { status: "other_account" as const }
    if (live && live.archivedAt === undefined && !existing) {
      const stored = await activeVersions(ctx, live._id)
      const game = args.game ?? DEFAULT_DECK_GAME
      const sent = versions?.map((version) => version.cards) ?? [args.cards]
      const compared = versions ? stored : stored.slice(-1)
      const sameDeck =
        compared.length === sent.length &&
        live.name === args.name.trim() &&
        (versions?.every(
          (version, index) =>
            compared[index].name === version.name.trim() &&
            (compared[index].note ?? "") === (version.note ?? "").trim(),
        ) ??
          true) &&
        (
          await Promise.all(
            compared.map(
              async (version, index) =>
                (await pinnedDeck(ctx, version._id)).deckFingerprint ===
                (await deckFingerprint(
                  sent[index].map((card) => ({ ...card, game: card.game ?? game })),
                )),
            ),
          )
        ).every(Boolean)
      return {
        status: "already_imported" as const,
        deckId: live._id,
        localUpdatedAt: sameDeck ? args.localUpdatedAt : null,
      }
    }
    await deckForKey(ctx, user._id, existing ? existing.deckKey : (args.deckKey ?? args.localId))
    if (versions) {
      const versionLimit = await deckVersionCapacity(ctx, user, versions.length)
      if (versions.length > versionLimit.limit)
        return { status: "version_limit" as const, capacity: versionLimit }
    }
    const capacity = await deckCapacity(ctx, user)
    if (!capacity.canCreate) return { status: "limit_reached" as const, capacity }
    const game = assertDeckGame(args.game ?? DEFAULT_DECK_GAME)
    await requireReleasedCapability(ctx, game, "deckImport")
    assertDeckSize(args.cards, game)
    for (const version of versions ?? []) assertDeckSize(version.cards, game)
    const format = assertDeckGameFormat(game, assertDeckFormat(args.format))
    const note = args.note ? assertDeckNote(args.note) : ""
    const now = Date.now()
    const deckId = await createOrReviveDeck(
      ctx,
      {
        ownerUserId: user._id,
        guestLocalId: args.localId,
        guestUpdatedAt: args.localUpdatedAt,
        name: assertDeckName(args.name),
        format,
        game,
        ...(note ? { note } : {}),
        createdAt: now,
        updatedAt: now,
      },
      existing ? existing.deckKey : (args.deckKey ?? args.localId),
    )
    if (versions) await replaceDeckVersions(ctx, deckId, game, versions, now)
    else await writeInitialVersion(ctx, deckId, game, args.cards, now)
    await refreshDeckIdentity(ctx, deckId)
    return { status: "imported" as const, deckId, localUpdatedAt: args.localUpdatedAt }
  },
})

export const importCatalog = mutation({
  args: {
    deckKey: v.optional(v.string()),
    catalogDeckId: v.id("deckCatalogs"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (args.deckKey !== undefined) await deckForKey(ctx, user._id, args.deckKey)
    await requireDeckCapacity(ctx, user)
    const catalogDeck = await ctx.db.get(args.catalogDeckId)
    if (!catalogDeck)
      throw new ConvexError({ code: "catalog_deck_not_found", message: "Catalog deck not found" })
    const game = assertDeckGame(catalogDeck.game)
    await requireReleasedCapability(ctx, game, "exampleDecks")
    await requireReleasedCapability(ctx, game, "deckImport")
    const entries = await ctx.db
      .query("deckCatalogCards")
      .withIndex("by_catalog_deck_id", (query) => query.eq("catalogDeckId", catalogDeck._id))
      .take(MAX_DECK_CARDS + 1)
    if (entries.length < 1)
      throw new ConvexError({ code: "empty_import", message: "Catalog deck has no cards" })
    const includeImages = await capabilityReleased(ctx, game, "images")
    const cards = entries.slice(0, MAX_DECK_CARDS).map((storedEntry) => {
      const {
        _id: _,
        _creationTime: __,
        catalogDeckId: ___,
        imageUrl: _imageUrl,
        smallImageUrl: _smallImageUrl,
        ...entry
      } = storedEntry
      return includeImages
        ? {
            ...entry,
            ...magicCatalogCardFields(entry),
            ...(storedEntry.imageUrl ? { imageUrl: storedEntry.imageUrl } : {}),
            ...(storedEntry.smallImageUrl ? { smallImageUrl: storedEntry.smallImageUrl } : {}),
          }
        : { ...entry, ...magicCatalogCardFields(entry) }
    })
    assertDeckSize(cards, game)
    const format = assertDeckGameFormat(
      game,
      assertDeckFormat(catalogDeck.format ?? defaultDeckFormat(game)),
    )
    const now = Date.now()
    const deckId = await createOrReviveDeck(
      ctx,
      {
        ownerUserId: user._id,
        name: assertDeckName(args.name ?? catalogDeck.name),
        format,
        game,
        createdAt: now,
        updatedAt: now,
      },
      args.deckKey,
    )
    await writeInitialVersion(ctx, deckId, game, cards, now)
    await refreshDeckIdentity(ctx, deckId)
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
    const game = args.game === undefined ? undefined : assertDeckGame(args.game)
    const currentGame = deck.game ?? DEFAULT_DECK_GAME
    if (game !== undefined && game !== currentGame)
      throw new ConvexError({
        code: "deck_game_immutable",
        message: "Create a new deck to change game systems",
      })
    const format =
      args.format === undefined
        ? undefined
        : assertDeckGameFormat(currentGame, assertDeckFormat(args.format))
    const note = args.note === undefined ? undefined : assertDeckNote(args.note)
    await ctx.db.patch(deck._id, {
      ...(args.name === undefined ? {} : { name: assertDeckName(args.name) }),
      ...(format === undefined ? {} : { format }),
      ...(game === undefined ? {} : { game }),
      ...(note === undefined ? {} : { note }),
      updatedAt: Date.now(),
      syncRevision: (deck.syncRevision ?? 0) + 1,
    })
    if (format !== undefined && format !== deck.format) await refreshDeckIdentity(ctx, deck._id)
    return null
  },
})

export const setFavorite = mutation({
  args: { deckId: v.id("decks"), favorite: v.boolean() },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    assertNotArchived(deck)
    await ctx.db.patch(deck._id, { favoritedAt: args.favorite ? Date.now() : undefined })
    return null
  },
})

export const setBringingVersion = mutation({
  args: { deckId: v.id("decks"), versionId: v.union(v.id("deckVersions"), v.null()) },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    assertNotArchived(deck)
    if (args.versionId !== null) {
      const version = await ctx.db.get(args.versionId)
      if (!version || version.deckId !== deck._id || version.archivedAt !== undefined)
        throw new ConvexError({ code: "deck_version_not_found", message: "Deck version not found" })
    }
    await ctx.db.patch(deck._id, { bringingVersionId: args.versionId ?? undefined })
    await refreshDeckIdentity(ctx, deck._id)
    return null
  },
})

function projectCard(deck: Doc<"decks">, includeImages: boolean, card: Doc<"deckCards">) {
  if (includeImages) {
    const imageUrl = isProviderGame(deck.game)
      ? GAME_PROVIDERS[deck.game].catalog.imageUrl?.(card)
      : undefined
    return imageUrl
      ? {
          ...card,
          imageUrl: card.imageUrl ?? imageUrl,
          smallImageUrl: card.smallImageUrl ?? card.imageUrl ?? imageUrl,
        }
      : card
  }
  const { imageUrl: _imageUrl, smallImageUrl: _smallImageUrl, ...textCard } = card
  return textCard
}

export const detail = query({
  args: { deckId: v.id("decks"), versionId: v.optional(v.id("deckVersions")) },
  handler: async (ctx, args) => {
    const { user, deck } = await ownedDeck(ctx, args.deckId)
    const stored = await activeVersions(ctx, deck._id)
    const startingValues = await versionStartingValues(ctx, deck, stored)
    const versions = await Promise.all(
      stored.map(async (version, index) => ({
        _id: version._id,
        versionNumber: version.versionNumber,
        name: version.name,
        note: version.note,
        cardCount: version.cardCount ?? 0,
        cardQuantity: version.cardQuantity ?? 0,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt ?? version.createdAt,
        record: await versionRecord(ctx, version._id),
        ...startingValues[index],
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
    const includeImages = await capabilityReleased(ctx, deck.game ?? DEFAULT_DECK_GAME, "images")
    return {
      deck: publicDeck(deck, stored),
      versions,
      version: selected ?? null,
      cards: cards.slice(0, MAX_DECK_CARDS).map((card) => projectCard(deck, includeImages, card)),
      capacity: await deckVersionCapacity(ctx, user, stored.length),
      shared:
        (await ctx.db
          .query("deckShares")
          .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
          .first()) !== null,
      record: await keyRecord(ctx, deck),
      // eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Deck stats are free; installed clients still read the retired lock flag.
      analyticsLocked: false,
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
    const game = deck.game ?? DEFAULT_DECK_GAME
    await requireReleasedCapability(ctx, game, "deckImport")
    assertDeckSize(args.cards, game)
    const versions = await activeVersions(ctx, deck._id)
    const target = args.versionId
      ? versions.find((version) => version._id === args.versionId)
      : versions[versions.length - 1]
    if (args.versionId && !target)
      throw new ConvexError({ code: "deck_version_not_found", message: "Deck version not found" })
    const now = Date.now()
    if (!target) {
      const versionId = await insertDeckVersion(
        ctx,
        deck._id,
        game,
        { versionNumber: 1, name: DEFAULT_VERSION_NAME },
        args.cards,
        now,
      )
      await ctx.db.patch(deck._id, { updatedAt: now })
      await refreshDeckIdentity(ctx, deck._id)
      return versionId
    }
    const totals = cardTotals(args.cards)
    const existingCards = await ctx.db
      .query("deckCards")
      .withIndex("by_deck_version", (q) => q.eq("deckVersionId", target._id))
      .take(MAX_DECK_CARDS + 1)
    if (
      canonicalCards(existingCards.map((card) => canonicalCardFieldsWithDefaults(game, card))) ===
      canonicalCards(args.cards.map((card) => cardFields(game, card)))
    )
      return target._id
    await replaceVersionCards(ctx, target._id, game, args.cards)
    await ctx.db.patch(target._id, {
      ...totals,
      syncRevision: (target.syncRevision ?? 0) + 1,
      updatedAt: now,
    })
    await ctx.db.patch(deck._id, { updatedAt: now })
    await refreshDeckIdentity(ctx, deck._id)
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
    const game = deck.game ?? DEFAULT_DECK_GAME
    const versionNumber =
      versions.reduce((highest, version) => Math.max(highest, version.versionNumber), 0) + 1
    const versionId = await insertDeckVersion(
      ctx,
      deck._id,
      game,
      { versionNumber, name: args.name, ...(args.note ? { note: args.note } : {}) },
      cards,
      now,
    )
    await ctx.db.patch(deck._id, { updatedAt: now })
    await refreshDeckIdentity(ctx, deck._id)
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
      syncRevision: (version.syncRevision ?? 0) + 1,
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
    await ctx.db.patch(version._id, {
      archivedAt: now,
      syncRevision: (version.syncRevision ?? 0) + 1,
      updatedAt: now,
    })
    await ctx.db.patch(deck._id, { updatedAt: now })
    await refreshDeckIdentity(ctx, deck._id)
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
    await ctx.db.patch(deck._id, {
      archivedAt: now,
      updatedAt: now,
      syncRevision: (deck.syncRevision ?? 0) + 1,
    })
    await endShares(ctx, deck._id)
    return null
  },
})

export const syncPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const { numItems } = args.paginationOpts
    if (!Number.isSafeInteger(numItems) || numItems < 1 || numItems > 100)
      throw new ConvexError({ code: "invalid_page_size", message: "Request 1–100 decks per page" })
    const result = await ctx.db
      .query("decks")
      .withIndex("by_owner_and_sync_id", (q) => q.eq("ownerUserId", user._id))
      .paginate(args.paginationOpts)
    return { ...result, ownerId: user.clerkUserId, page: result.page.map(syncedDeck) }
  },
})

const SYNC_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const syncWrite = mutation({
  args: {
    id: v.string(),
    deckKey: v.optional(v.string()),
    operationId: v.string(),
    expectedOwnerId: v.optional(v.string()),
    returnConflict: v.optional(v.boolean()),
    expectedRevision: v.number(),
    name: v.string(),
    format: v.string(),
    game: v.string(),
    note: v.string(),
    deleted: v.boolean(),
  },
  returns: v.union(
    syncedDeckValidator,
    v.object({ status: v.literal("conflict"), deck: syncedDeckValidator }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    | Infer<typeof syncedDeckValidator>
    | { status: "conflict"; deck: Infer<typeof syncedDeckValidator> }
  > => {
    const user = await requireUser(ctx)
    if (args.expectedOwnerId !== undefined && args.expectedOwnerId !== user.clerkUserId)
      throw new ConvexError({
        code: "sync_owner_changed",
        message: "The signed-in account changed",
      })
    if (!SYNC_UUID.test(args.operationId))
      throw new ConvexError({
        code: "invalid_operation_id",
        message: "Operation ID must be a UUID",
      })
    if (
      !Number.isSafeInteger(args.expectedRevision) ||
      args.expectedRevision < 0 ||
      args.expectedRevision >= Number.MAX_SAFE_INTEGER
    )
      throw new ConvexError({ code: "invalid_revision", message: "Invalid deck revision" })
    const databaseId = ctx.db.normalizeId("decks", args.id)
    if (!databaseId && !SYNC_UUID.test(args.id))
      throw new ConvexError({
        code: "invalid_sync_id",
        message: "Deck ID must be a UUID or deck ID",
      })
    const id = databaseId ? args.id : args.id.toLowerCase()
    if (args.deckKey !== undefined) assertDeckKey(args.deckKey)
    const operationId = args.operationId.toLowerCase()
    const requestKey = JSON.stringify([
      id,
      args.expectedRevision,
      args.name,
      args.format,
      args.game,
      args.note,
      args.deleted,
      ...(args.deckKey === undefined ? [] : [args.deckKey]),
    ])
    const receipt = await ctx.db
      .query("deckSyncReceipts")
      .withIndex("by_owner_and_operation_id", (q) =>
        q.eq("ownerUserId", user._id).eq("operationId", operationId),
      )
      .unique()
    if (receipt) {
      if (receipt.requestKey !== requestKey)
        throw new ConvexError({
          code: "sync_operation_mismatch",
          message: "Operation ID was reused for a different change",
        })
      return receipt.result
    }

    let deck = databaseId
      ? await ctx.db.get(databaseId)
      : await ctx.db
          .query("decks")
          .withIndex("by_owner_and_sync_id", (q) => q.eq("ownerUserId", user._id).eq("syncId", id))
          .unique()
    if (
      (databaseId && !deck) ||
      (deck && (deck.ownerUserId !== user._id || (deck.syncId ?? deck._id) !== id)) ||
      (!deck && args.deleted)
    )
      throw new ConvexError({ code: "deck_not_found", message: "Deck not found" })
    if ((deck?.syncRevision ?? 0) !== args.expectedRevision) {
      if (args.returnConflict && deck) return { status: "conflict", deck: syncedDeck(deck) }
      throw new ConvexError({ code: "sync_conflict", message: "Deck changed on another device" })
    }
    if (deck && args.deckKey && args.deckKey !== deck.deckKey)
      throw new ConvexError({ code: "deck_key_conflict", message: "Deck key cannot change" })
    if (deck?.archivedAt !== undefined && !args.deleted && args.deckKey !== undefined) {
      await requireDeckCapacity(ctx, user)
      await ctx.db.patch(deck._id, { archivedAt: undefined, movedToDeviceAt: undefined })
    }
    const metadata = { name: args.name, format: args.format, game: args.game, note: args.note }
    let deckId: Id<"decks">
    if (!deck) {
      const previous = await deckForKey(ctx, user._id, args.deckKey ?? id)
      if (previous) {
        await requireDeckCapacity(ctx, user)
        await ctx.db.patch(previous._id, {
          archivedAt: undefined,
          movedToDeviceAt: undefined,
          unsyncedAt: undefined,
        })
        deckId = previous._id
        await ctx.runMutation(api.decks.update, { deckId, ...metadata })
      } else {
        deckId = await ctx.runMutation(api.decks.create, {
          ...metadata,
          deckKey: args.deckKey ?? id,
        })
        await ctx.db.patch(deckId, { syncId: id, syncRevision: 1 })
      }
    } else {
      deckId = deck._id
      if (args.deleted) await ctx.runMutation(api.decks.archive, { deckId })
      else await ctx.runMutation(api.decks.update, { deckId, ...metadata })
    }
    deck = await ctx.db.get(deckId)
    if (!deck) throw new Error("Deck disappeared during sync")
    const result = syncedDeck(deck)
    await ctx.db.insert("deckSyncReceipts", {
      ownerUserId: user._id,
      operationId,
      requestKey,
      result,
    })
    return result
  },
})

export const syncVersionWrite = mutation({
  args: {
    deckId: v.id("decks"),
    versionId: v.id("deckVersions"),
    operationId: v.string(),
    expectedRevision: v.number(),
    cards: v.array(cardValidator),
    returnConflict: v.optional(v.boolean()),
  },
  returns: v.union(
    syncedVersionValidator,
    v.object({ status: v.literal("conflict"), version: syncedVersionValidator }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    | Infer<typeof syncedVersionValidator>
    | { status: "conflict"; version: Infer<typeof syncedVersionValidator> }
  > => {
    const user = await requireUser(ctx)
    if (!SYNC_UUID.test(args.operationId))
      throw new ConvexError({
        code: "invalid_operation_id",
        message: "Operation ID must be a UUID",
      })
    if (
      !Number.isSafeInteger(args.expectedRevision) ||
      args.expectedRevision < 0 ||
      args.expectedRevision >= Number.MAX_SAFE_INTEGER
    )
      throw new ConvexError({ code: "invalid_revision", message: "Invalid version revision" })
    const operationId = args.operationId.toLowerCase()
    const requestKey = JSON.stringify([
      args.deckId,
      args.versionId,
      args.expectedRevision,
      canonicalCards(args.cards),
    ])
    const receipt = await ctx.db
      .query("deckVersionSyncReceipts")
      .withIndex("by_owner_and_operation_id", (q) =>
        q.eq("ownerUserId", user._id).eq("operationId", operationId),
      )
      .unique()
    if (receipt) {
      if (receipt.requestKey !== requestKey)
        throw new ConvexError({
          code: "sync_operation_mismatch",
          message: "Operation ID was reused for a different change",
        })
      return receipt.result
    }

    const { deck } = await ownedDeck(ctx, args.deckId)
    assertNotArchived(deck)
    const game = deck.game ?? DEFAULT_DECK_GAME
    await requireReleasedCapability(ctx, game, "deckImport")
    const version = await ctx.db.get(args.versionId)
    if (!version || version.deckId !== deck._id)
      throw new ConvexError({ code: "deck_version_not_found", message: "Deck version not found" })
    if (version.archivedAt !== undefined || (version.syncRevision ?? 0) !== args.expectedRevision) {
      if (args.returnConflict) return { status: "conflict", version: syncedVersion(version) }
      throw new ConvexError({
        code: "sync_conflict",
        message: "Deck version changed on another device",
      })
    }
    assertDeckSize(args.cards, game)
    const totals = cardTotals(args.cards)
    const existingCards = await ctx.db
      .query("deckCards")
      .withIndex("by_deck_version", (q) => q.eq("deckVersionId", version._id))
      .take(MAX_DECK_CARDS + 1)
    const revision = (version.syncRevision ?? 0) + 1
    if (
      canonicalCards(existingCards.map((card) => canonicalCardFieldsWithDefaults(game, card))) ===
      canonicalCards(args.cards.map((card) => cardFields(game, card)))
    ) {
      const result = syncedVersion(version)
      await ctx.db.insert("deckVersionSyncReceipts", {
        ownerUserId: user._id,
        operationId,
        requestKey,
        result,
      })
      return result
    }
    await replaceVersionCards(ctx, version._id, game, args.cards)
    const now = Date.now()
    await ctx.db.patch(version._id, { ...totals, syncRevision: revision, updatedAt: now })
    await ctx.db.patch(deck._id, { updatedAt: now })
    await refreshDeckIdentity(ctx, deck._id)
    const result = syncedVersion({ ...version, ...totals, syncRevision: revision, updatedAt: now })
    await ctx.db.insert("deckVersionSyncReceipts", {
      ownerUserId: user._id,
      operationId,
      requestKey,
      result,
    })
    return result
  },
})
async function versionOperationReceipt(
  ctx: MutationCtx,
  user: Doc<"users">,
  operationId: string,
  requestKey: string,
): Promise<Infer<typeof syncedVersionValidator> | null> {
  if (!SYNC_UUID.test(operationId))
    throw new ConvexError({
      code: "invalid_operation_id",
      message: "Operation ID must be a UUID",
    })
  const receipt = await ctx.db
    .query("deckVersionSyncReceipts")
    .withIndex("by_owner_and_operation_id", (q) =>
      q.eq("ownerUserId", user._id).eq("operationId", operationId.toLowerCase()),
    )
    .unique()
  if (!receipt) return null
  if (receipt.requestKey !== requestKey)
    throw new ConvexError({
      code: "sync_operation_mismatch",
      message: "Operation ID was reused for a different change",
    })
  return receipt.result
}

function conflictVersion(version: Doc<"deckVersions">) {
  return { status: "conflict" as const, version: syncedVersion(version) }
}

async function ownedStableVersion(ctx: MutationCtx, versionId: Id<"deckVersions">) {
  const version = await ctx.db.get(versionId)
  if (!version)
    throw new ConvexError({ code: "deck_version_not_found", message: "Deck version not found" })
  const { deck } = await ownedDeck(ctx, version.deckId)
  assertNotArchived(deck)
  return { deck, version }
}

function assertExpectedRevision(expectedRevision: number) {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision >= Number.MAX_SAFE_INTEGER
  )
    throw new ConvexError({ code: "invalid_revision", message: "Invalid version revision" })
}

export const syncCreateVersion = mutation({
  args: {
    deckId: v.id("decks"),
    operationId: v.string(),
    name: v.string(),
    note: v.optional(v.string()),
    cards: v.array(cardValidator),
  },
  returns: syncedVersionValidator,
  handler: async (ctx, args): Promise<Infer<typeof syncedVersionValidator>> => {
    const user = await requireUser(ctx)
    const requestKey = JSON.stringify([
      "version-create",
      args.deckId,
      args.name,
      args.note ?? null,
      ...args.cards.map((card, index) => `card${index}:${canonicalCards([card])}`),
    ])
    const replay = await versionOperationReceipt(ctx, user, args.operationId, requestKey)
    if (replay) return replay
    const { deck } = await ownedDeck(ctx, args.deckId)
    assertNotArchived(deck)
    const game = deck.game ?? DEFAULT_DECK_GAME
    await requireReleasedCapability(ctx, game, "deckImport")
    assertDeckSize(args.cards, game)
    const versions = await activeVersions(ctx, deck._id)
    await requireVersionCapacity(ctx, user, versions.length)
    const now = Date.now()
    const versionNumber =
      versions.reduce((highest, version) => Math.max(highest, version.versionNumber), 0) + 1
    const versionId = await insertDeckVersion(
      ctx,
      deck._id,
      game,
      { versionNumber, name: args.name, ...(args.note ? { note: args.note } : {}) },
      args.cards,
      now,
    )
    await ctx.db.patch(deck._id, { updatedAt: now })
    await refreshDeckIdentity(ctx, deck._id)
    const version = await ctx.db.get(versionId)
    if (!version) throw new Error("Deck version disappeared during sync")
    const result = syncedVersion(version)
    await ctx.db.insert("deckVersionSyncReceipts", {
      ownerUserId: user._id,
      operationId: args.operationId.toLowerCase(),
      requestKey,
      result,
    })
    return result
  },
})

export const syncUpdateVersion = mutation({
  args: {
    versionId: v.id("deckVersions"),
    operationId: v.string(),
    expectedRevision: v.number(),
    name: v.optional(v.string()),
    note: v.optional(v.string()),
    returnConflict: v.optional(v.boolean()),
  },
  returns: v.union(
    syncedVersionValidator,
    v.object({ status: v.literal("conflict"), version: syncedVersionValidator }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    | Infer<typeof syncedVersionValidator>
    | { status: "conflict"; version: Infer<typeof syncedVersionValidator> }
  > => {
    const user = await requireUser(ctx)
    assertExpectedRevision(args.expectedRevision)
    if (args.name === undefined && args.note === undefined)
      throw new ConvexError({
        code: "invalid_version_update",
        message: "Provide a name or note change",
      })
    const requestKey = JSON.stringify([
      "version-update",
      args.versionId,
      args.expectedRevision,
      args.name ?? null,
      args.note ?? null,
    ])
    const replay = await versionOperationReceipt(ctx, user, args.operationId, requestKey)
    if (replay) return replay
    const { deck, version } = await ownedStableVersion(ctx, args.versionId)
    if (version.archivedAt !== undefined || (version.syncRevision ?? 0) !== args.expectedRevision) {
      if (args.returnConflict) return conflictVersion(version)
      throw new ConvexError({
        code: "sync_conflict",
        message: "Deck version changed on another device",
      })
    }
    const now = Date.now()
    const syncRevision = (version.syncRevision ?? 0) + 1
    await ctx.db.patch(version._id, {
      ...(args.name === undefined ? {} : { name: assertVersionName(args.name) }),
      ...(args.note === undefined ? {} : { note: assertDeckNote(args.note) }),
      syncRevision,
      updatedAt: now,
    })
    await ctx.db.patch(deck._id, { updatedAt: now })
    const updated = await ctx.db.get(version._id)
    if (!updated) throw new Error("Deck version disappeared during sync")
    const result = syncedVersion(updated)
    await ctx.db.insert("deckVersionSyncReceipts", {
      ownerUserId: user._id,
      operationId: args.operationId.toLowerCase(),
      requestKey,
      result,
    })
    return result
  },
})

export const syncDeleteVersion = mutation({
  args: {
    versionId: v.id("deckVersions"),
    operationId: v.string(),
    expectedRevision: v.number(),
    returnConflict: v.optional(v.boolean()),
  },
  returns: v.union(
    syncedVersionValidator,
    v.object({ status: v.literal("conflict"), version: syncedVersionValidator }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    | Infer<typeof syncedVersionValidator>
    | { status: "conflict"; version: Infer<typeof syncedVersionValidator> }
  > => {
    const user = await requireUser(ctx)
    assertExpectedRevision(args.expectedRevision)
    const requestKey = JSON.stringify(["version-delete", args.versionId, args.expectedRevision])
    const replay = await versionOperationReceipt(ctx, user, args.operationId, requestKey)
    if (replay) return replay
    const { deck, version } = await ownedStableVersion(ctx, args.versionId)
    if (version.archivedAt !== undefined || (version.syncRevision ?? 0) !== args.expectedRevision) {
      if (args.returnConflict) return conflictVersion(version)
      throw new ConvexError({
        code: "sync_conflict",
        message: "Deck version changed on another device",
      })
    }
    const versions = await activeVersions(ctx, deck._id)
    if (versions.length <= 1)
      throw new ConvexError({
        code: "last_version",
        message: "A deck needs at least one version",
      })
    const now = Date.now()
    const syncRevision = (version.syncRevision ?? 0) + 1
    await ctx.db.patch(version._id, { archivedAt: now, syncRevision, updatedAt: now })
    await ctx.db.patch(deck._id, { updatedAt: now })
    await refreshDeckIdentity(ctx, deck._id)
    const result = syncedVersion({
      ...version,
      archivedAt: now,
      syncRevision,
      updatedAt: now,
    })
    await ctx.db.insert("deckVersionSyncReceipts", {
      ownerUserId: user._id,
      operationId: args.operationId.toLowerCase(),
      requestKey,
      result,
    })
    return result
  },
})

export const versionsPull = query({
  args: { deckId: v.id("decks"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    const { numItems } = args.paginationOpts
    if (!Number.isSafeInteger(numItems) || numItems < 1 || numItems > 100)
      throw new ConvexError({
        code: "invalid_page_size",
        message: "Request 1–100 versions per page",
      })
    const result = await ctx.db
      .query("deckVersions")
      .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", deck._id))
      .paginate(args.paginationOpts)
    return { ...result, deckId: deck._id, page: result.page.map(syncedVersion) }
  },
})
export const readVersion = query({
  args: { deckId: v.id("decks"), versionId: v.id("deckVersions") },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    const version = await ctx.db.get(args.versionId)
    if (!version || version.deckId !== deck._id)
      throw new ConvexError({ code: "deck_version_not_found", message: "Deck version not found" })
    const cards = await ctx.db
      .query("deckCards")
      .withIndex("by_deck_version", (q) => q.eq("deckVersionId", version._id))
      .take(MAX_DECK_CARDS + 1)
    const includeImages = await capabilityReleased(ctx, deck.game ?? DEFAULT_DECK_GAME, "images")
    return {
      version: syncedVersion(version),
      cards: cards.slice(0, MAX_DECK_CARDS).map((card) => projectCard(deck, includeImages, card)),
    }
  },
})

/** why: a game stores only the seat's version id, and keeps it after the deck moves on, so this reads archived versions too. */
export const versionCards = query({
  args: { versionId: v.id("deckVersions") },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId)
    if (!version)
      throw new ConvexError({ code: "deck_version_not_found", message: "Deck version not found" })
    const { deck } = await ownedDeck(ctx, version.deckId)
    const cards = await ctx.db
      .query("deckCards")
      .withIndex("by_deck_version", (q) => q.eq("deckVersionId", version._id))
      .take(MAX_DECK_CARDS)
    return {
      revision: syncedVersion(version).revision,
      cards: cards.map((card) => projectCard(deck, false, card)),
    }
  },
})

export const selectForSeat = mutation({
  args: {
    publicId: v.string(),
    seat: v.number(),
    deckVersionId: v.optional(v.id("deckVersions")),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique()
    if (!game || game.status !== "lobby")
      throw new ConvexError({
        code: "deck_selection_not_allowed",
        message: "Decks can only be selected in a lobby",
      })
    const { user, player } = await requireSeatOwner(ctx, game._id, args.seat)
    await limitGameRate(ctx, "gameWrite", user._id)
    if (args.deckVersionId === undefined) {
      if (game.deckRequired === true)
        throw new ConvexError({
          code: "deck_required",
          message: "This lobby requires every player to choose a deck",
        })
      await ctx.db.patch(player._id, {
        deckVersionId: undefined,
        deckKey: undefined,
        deckFingerprint: undefined,
      })
      await ctx.db.patch(game._id, { updatedAt: Date.now() })
      return { deckId: null, deckVersionId: null }
    }
    const { deck, version } = await ownedVersion(ctx, args.deckVersionId)
    assertNotArchived(deck)
    const deckGame = deck.game ?? DEFAULT_DECK_GAME
    const lobbyGame = game.system ?? game.game ?? DEFAULT_DECK_GAME
    if (deckGame !== lobbyGame)
      throw new ConvexError({
        code: "deck_system_mismatch",
        message: "This deck belongs to another game system",
      })
    if (deck.format !== (game.format ?? game.ruleset))
      throw new ConvexError({
        code: "deck_format_mismatch",
        message: "Choose a deck matching the lobby format",
      })
    await ctx.db.patch(player._id, {
      deckVersionId: version._id,
      ...(await pinnedDeck(ctx, version._id)),
    })
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
    return { deckId: deck._id, deckVersionId: version._id }
  },
})

export const stats = query({
  args: { deckId: v.id("decks") },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    const versions = await activeVersions(ctx, deck._id)
    return {
      locked: false as const,
      deckId: deck._id,
      ...(await keyRecord(ctx, deck)),
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

export const moveToDevice = mutation({
  args: {
    deckId: v.id("decks"),
    expectedRevision: v.number(),
    expectedVersion: v.union(
      v.null(),
      v.object({ id: v.id("deckVersions"), updatedAt: v.number() }),
    ),
    expectedVersions: v.optional(
      v.array(v.object({ id: v.id("deckVersions"), updatedAt: v.number() })),
    ),
  },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    if (deck.movedToDeviceAt !== undefined) return syncedDeck(deck)
    if ((deck.syncRevision ?? 0) !== args.expectedRevision)
      throw new ConvexError({ code: "sync_conflict", message: "Deck changed on another device" })
    const stored = await activeVersions(ctx, deck._id)
    const current = stored.at(-1)
    const expectedVersions = args.expectedVersions
    if (
      (current?._id ?? null) !== (args.expectedVersion?.id ?? null) ||
      (current && (current.updatedAt ?? current.createdAt) !== args.expectedVersion?.updatedAt) ||
      (expectedVersions !== undefined &&
        (stored.length !== expectedVersions.length ||
          stored.some(
            (version, index) =>
              version._id !== expectedVersions[index].id ||
              (version.updatedAt ?? version.createdAt) !== expectedVersions[index].updatedAt,
          )))
    )
      throw new ConvexError({
        code: "sync_conflict",
        message: "Deck cards changed on another device",
      })
    const now = Date.now()
    await ctx.db.patch(deck._id, {
      archivedAt: now,
      movedToDeviceAt: now,
      updatedAt: now,
      syncRevision: (deck.syncRevision ?? 0) + 1,
    })
    await endShares(ctx, deck._id)
    return syncedDeck((await ctx.db.get(deck._id))!)
  },
})

export const statsForKey = query({
  args: { deckKey: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    assertDeckKey(args.deckKey)
    const deckKey =
      (await resultDeckKey(ctx, { userId: user._id, deckKey: args.deckKey })) ?? args.deckKey
    const rows = ctx.db
      .query("deckKeyStats")
      .withIndex("by_user_and_deck_key_and_fingerprint", (q) =>
        q.eq("userId", user._id).eq("deckKey", deckKey),
      )
    const all = await ctx.db
      .query("deckKeyStats")
      .withIndex("by_user_and_deck_key_and_fingerprint", (q) =>
        q.eq("userId", user._id).eq("deckKey", deckKey).eq("fingerprint", "all"),
      )
      .unique()
    return {
      all,
      fingerprints: (await rows.take(51)).filter((row) => row.fingerprint !== "all").slice(0, 50),
    }
  },
})

const SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/

function shareToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

async function endShares(ctx: MutationCtx, deckId: Id<"decks">) {
  for (const link of await ctx.db
    .query("deckShares")
    .withIndex("by_deck", (q) => q.eq("deckId", deckId))
    .take(10))
    await ctx.db.delete(link._id)
}

/** why: results travel to opponents with the deck key, so the key is a hash that cannot open the link. */
async function sharedDeckKey(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
  return `shared-${hex.join("").slice(0, 32)}`
}

/** why: one link per deck, so sharing again hands back the link already sent. */
export const share = mutation({
  args: { deckId: v.id("decks") },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    assertNotArchived(deck)
    const existing = await ctx.db
      .query("deckShares")
      .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
      .first()
    if (existing) return { token: existing.token }
    const token = shareToken()
    await ctx.db.insert("deckShares", { deckId: deck._id, token, createdAt: Date.now() })
    return { token }
  },
})

/** why: the old link stops working, and sharing again makes a new one. */
export const unshare = mutation({
  args: { deckId: v.id("decks") },
  handler: async (ctx, args) => {
    const { deck } = await ownedDeck(ctx, args.deckId)
    await endShares(ctx, deck._id)
    return null
  },
})

/** why: anyone with the link may read the deck, signed in or not; the link shows the version its owner brings. */
export const shared = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!SHARE_TOKEN.test(args.token)) return null
    const link = await ctx.db
      .query("deckShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique()
    const deck = link ? await ctx.db.get(link.deckId) : null
    if (!deck || deck.archivedAt !== undefined) return null
    const versions = await activeVersions(ctx, deck._id)
    const version =
      versions.find((candidate) => candidate._id === deck.bringingVersionId) ?? versions.at(-1)
    if (!version) return null
    const game = deck.game ?? DEFAULT_DECK_GAME
    const cards = await ctx.db
      .query("deckCards")
      .withIndex("by_deck_version", (q) => q.eq("deckVersionId", version._id))
      .take(MAX_DECK_CARDS)
    const includeImages = await capabilityReleased(ctx, game, "images")
    const startingValue = await deckStartingValue(ctx, version._id, game, deck.format)
    return {
      deckKey: await sharedDeckKey(args.token),
      name: deck.name,
      game,
      format: deck.format,
      ...(deck.commanderNames ? { commanderNames: deck.commanderNames } : {}),
      ...(startingValue === undefined ? {} : { startingValue }),
      cards: cards.map((card) => {
        const {
          _id: _cardId,
          _creationTime: _created,
          deckVersionId: _versionId,
          ...shown
        } = projectCard(deck, includeImages, card)
        return shown
      }),
    }
  },
})
