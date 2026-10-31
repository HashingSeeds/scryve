import { ConvexError, v, type Infer } from "convex/values"

import { assertDeckFingerprint, assertDeckKey } from "./deckKeys"
import { integration } from "./integrations"
import { HIDDEN_COMMANDER_NAME, nameFailsGate } from "./nameFilter"
import { assertDeckName } from "./policy"
import { identitySection } from "./systems"
import type { Doc, Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"

export const MAX_IDENTITY_CARDS = 2
const MAX_CARD_ID_LENGTH = 128
const MAX_CARD_NAME_LENGTH = 200

export const resultOutcomeValidator = v.union(
  v.literal("win"),
  v.literal("loss"),
  v.literal("draw"),
  v.literal("unknown"),
)

export const deckIdentityValidator = v.array(v.object({ cardId: v.string(), name: v.string() }))

export const deckLabelValidator = v.object({
  deckKey: v.optional(v.string()),
  fingerprint: v.optional(v.string()),
  name: v.optional(v.string()),
  identity: v.optional(deckIdentityValidator),
})

export const resultOpponentValidator = v.object({
  displayName: v.string(),
  userId: v.optional(v.id("users")),
  outcome: v.optional(resultOutcomeValidator),
  deck: v.optional(deckLabelValidator),
})

export type DeckLabel = Infer<typeof deckLabelValidator>
export type DeckIdentity = Infer<typeof deckIdentityValidator>
export type ResultOpponent = Infer<typeof resultOpponentValidator>

function invalidLabel(message: string) {
  return new ConvexError({ code: "invalid_deck_label", message })
}

function normalizedIdentity(identity: DeckIdentity) {
  const cards = identity.map(({ cardId, name }) => ({ cardId: cardId.trim(), name: name.trim() }))
  const valid =
    cards.length >= 1 &&
    cards.length <= MAX_IDENTITY_CARDS &&
    new Set(cards.map(({ cardId }) => cardId)).size === cards.length &&
    cards.every(
      ({ cardId, name }) =>
        cardId.length >= 1 &&
        cardId.length <= MAX_CARD_ID_LENGTH &&
        name.length >= 1 &&
        name.length <= MAX_CARD_NAME_LENGTH,
    )
  return valid ? cards.sort((left, right) => left.cardId.localeCompare(right.cardId)) : undefined
}

function assertIdentity(identity: DeckIdentity) {
  const normalized = normalizedIdentity(identity)
  if (!normalized)
    throw invalidLabel(
      `A deck is known by 1–${MAX_IDENTITY_CARDS} distinct cards, each with a name`,
    )
  return normalized
}

async function catalogIdentity(
  ctx: QueryCtx,
  game: string | undefined,
  identity: DeckIdentity,
): Promise<DeckIdentity> {
  const namespace = game ? integration(game)?.identityNamespace : undefined
  const cards = await Promise.all(
    identity.map(async (card) => {
      const known =
        game && namespace
          ? await ctx.db
              .query("gameCards")
              .withIndex("by_game_and_identity_namespace_and_card_id", (q) =>
                q.eq("game", game).eq("identityNamespace", namespace).eq("cardId", card.cardId),
              )
              .unique()
          : null
      return known ? { ...card, name: known.name } : card
    }),
  )
  return cards
}

const HIDDEN_CARD_ID = "hidden"

export function publicIdentity(identity: DeckIdentity): DeckIdentity {
  // why: some games derive card ids from names (Riftbound), so a hidden card loses its id too.
  const cards = identity.map((card) =>
    nameFailsGate(card.name) ? { cardId: HIDDEN_CARD_ID, name: HIDDEN_COMMANDER_NAME } : card,
  )
  return cards
    .filter((card, index) => cards.findIndex(({ cardId }) => cardId === card.cardId) === index)
    .sort((left, right) => left.cardId.localeCompare(right.cardId))
}

export async function assertDeckLabel(
  ctx: QueryCtx,
  game: string | undefined,
  label: DeckLabel | undefined,
): Promise<DeckLabel | undefined> {
  if (!label) return undefined
  if (label.fingerprint !== undefined && label.deckKey === undefined)
    throw invalidLabel("A list fingerprint needs its deck key")
  const name = label.name?.trim() ? assertDeckName(label.name) : undefined
  const identity =
    label.identity !== undefined
      ? await catalogIdentity(ctx, game, assertIdentity(label.identity))
      : undefined
  const checked = {
    ...(label.deckKey !== undefined ? { deckKey: assertDeckKey(label.deckKey) } : {}),
    ...(label.fingerprint !== undefined
      ? { fingerprint: assertDeckFingerprint(label.fingerprint) }
      : {}),
    ...(name ? { name } : {}),
    ...(identity ? { identity } : {}),
  }
  return Object.keys(checked).length ? checked : undefined
}

export async function deckIdentityOf(
  ctx: QueryCtx,
  deckVersionId: Id<"deckVersions">,
  system: string | undefined,
  format: string | undefined,
): Promise<DeckIdentity | undefined> {
  const section = identitySection(system, format)
  if (!section) return undefined
  const cards = await ctx.db
    .query("deckCards")
    .withIndex("by_deck_version", (q) => q.eq("deckVersionId", deckVersionId))
    .filter((q) => q.or(q.eq(q.field("section"), section.id), q.eq(q.field("board"), section.id)))
    .take(MAX_IDENTITY_CARDS + 1)
  const identity = cards.flatMap((card) => {
    const cardId = card.cardId ?? card.oracleId
    return cardId ? [{ cardId, name: card.name }] : []
  })
  const normalized = identity.length === cards.length ? normalizedIdentity(identity) : undefined
  return normalized && (await catalogIdentity(ctx, system, normalized))
}

type Seat = {
  seat: number
  displayName: string
  userId?: Id<"users">
  outcome?: Infer<typeof resultOutcomeValidator>
  deckKey?: string
  deckFingerprint?: string
  deckName?: string
  deckLabel?: DeckLabel
  deletedAt?: number
}

function seatDeck(seat: Seat): DeckLabel | undefined {
  const label = seat.deckLabel
  const deckKey = seat.deckKey ?? label?.deckKey
  const fingerprint = seat.deckKey ? seat.deckFingerprint : label?.fingerprint
  const name = seat.deckName ?? label?.name
  const deck = {
    ...(deckKey ? { deckKey } : {}),
    ...(deckKey && fingerprint ? { fingerprint } : {}),
    ...(name ? { name } : {}),
    ...(label?.identity ? { identity: label.identity } : {}),
  }
  return Object.keys(deck).length ? deck : undefined
}

export function resultOpponents(
  seats: readonly Seat[],
  self: { seat: number; userId: Id<"users"> },
): ResultOpponent[] {
  return seats
    .filter((seat) => seat.seat !== self.seat && seat.userId !== self.userId && !seat.deletedAt)
    .map((seat) => {
      const deck = seatDeck(seat)
      return {
        displayName: seat.displayName,
        ...(seat.userId ? { userId: seat.userId } : {}),
        ...(seat.outcome ? { outcome: seat.outcome } : {}),
        ...(deck ? { deck } : {}),
      }
    })
}

export function summarySeats(players: Doc<"gameSummaries">["players"]): Seat[] {
  return players.map(({ deckNameAtFinish, ...player }) => ({
    ...player,
    ...(deckNameAtFinish !== undefined ? { deckName: deckNameAtFinish } : {}),
  }))
}
