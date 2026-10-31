import { DEFAULT_DECK_GAME } from "./deckGames"
import { MAX_DECK_CARDS, MAX_DECK_VERSIONS } from "./policy"
import { hasCommandZone } from "./systems"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

const MAGIC_COLORS = ["W", "U", "B", "R", "G"] as const
const MAX_CACHED_PRINTINGS_PER_NAME = 8

type IdentityCard = Pick<Doc<"deckCards">, "name" | "section" | "board" | "commanderColor"> &
  Partial<Pick<Doc<"cardReferences">, "colorIdentity">>

export type DeckIdentityFields = Pick<Doc<"decks">, "identityColors" | "commanderNames">

const sectionOf = (card: Pick<IdentityCard, "section" | "board">) =>
  card.section ?? card.board ?? "main"

/** why: an unknown commander leaves the colors unset, since a guess would file the deck under the wrong colors. */
export function magicDeckIdentity(
  format: string,
  cards: readonly IdentityCard[],
): DeckIdentityFields {
  const commanders = hasCommandZone(DEFAULT_DECK_GAME, format)
    ? cards.filter((card) => sectionOf(card) === "commander")
    : []
  const names = [...new Set(commanders.map(({ name }) => name))].sort()
  const named = names.length ? { commanderNames: names } : {}
  const known = (card: IdentityCard) =>
    card.colorIdentity !== undefined || card.commanderColor !== undefined
  if (!commanders.every(known)) return named
  const sources = commanders.length
    ? commanders
    : cards.filter((card) => sectionOf(card) !== "sideboard" && known(card))
  if (!sources.length) return named
  const colors = new Set(
    sources.flatMap((card) => [...(card.colorIdentity ?? ""), ...(card.commanderColor ?? "")]),
  )
  return { identityColors: MAGIC_COLORS.filter((color) => colors.has(color)), ...named }
}

async function shownVersionId(ctx: MutationCtx, deck: Doc<"decks">) {
  const versions = await ctx.db
    .query("deckVersions")
    .withIndex("by_deck_and_archived_at", (q) =>
      q.eq("deckId", deck._id).eq("archivedAt", undefined),
    )
    .take(MAX_DECK_VERSIONS * 4)
  const bringing = versions.find((version) => version._id === deck.bringingVersionId)
  const latest = versions.reduce<Doc<"deckVersions"> | undefined>(
    (highest, version) =>
      !highest || version.versionNumber > highest.versionNumber ? version : highest,
    undefined,
  )
  return (bringing ?? latest)?._id
}

async function cachedColorIdentity(ctx: MutationCtx, card: Doc<"deckCards">) {
  const scryfallId = card.scryfallId ?? card.printingId
  const printing = scryfallId
    ? await ctx.db
        .query("cardReferences")
        .withIndex("by_scryfall_id", (q) => q.eq("scryfallId", scryfallId))
        .unique()
    : null
  if (printing?.colorIdentity !== undefined) return printing.colorIdentity
  const sameName = await ctx.db
    .query("cardReferences")
    .withIndex("by_name", (q) => q.eq("name", card.name))
    .take(MAX_CACHED_PRINTINGS_PER_NAME)
  return sameName.find((reference) => reference.colorIdentity !== undefined)?.colorIdentity
}

export async function deckIdentity(
  ctx: MutationCtx,
  deck: Doc<"decks">,
): Promise<DeckIdentityFields> {
  if ((deck.game ?? DEFAULT_DECK_GAME) !== DEFAULT_DECK_GAME) return {}
  const versionId = await shownVersionId(ctx, deck)
  if (!versionId) return {}
  const cards = await ctx.db
    .query("deckCards")
    .withIndex("by_deck_version", (q) => q.eq("deckVersionId", versionId))
    .take(MAX_DECK_CARDS)
  const hasCommander =
    hasCommandZone(DEFAULT_DECK_GAME, deck.format) &&
    cards.some((card) => sectionOf(card) === "commander")
  const colorSource = (card: Doc<"deckCards">) =>
    hasCommander ? sectionOf(card) === "commander" : sectionOf(card) !== "sideboard"
  const colorIdentities = await Promise.all(
    cards.map((card) => (colorSource(card) ? cachedColorIdentity(ctx, card) : undefined)),
  )
  return magicDeckIdentity(
    deck.format,
    cards.map((card, index) => {
      const colorIdentity = colorIdentities[index]
      return colorIdentity === undefined ? card : { ...card, colorIdentity }
    }),
  )
}

export async function refreshDeckIdentity(ctx: MutationCtx, deckId: Id<"decks">) {
  const deck = await ctx.db.get(deckId)
  if (!deck) return false
  const next = await deckIdentity(ctx, deck)
  const stored = { identityColors: deck.identityColors, commanderNames: deck.commanderNames }
  if (JSON.stringify(stored) === JSON.stringify(next)) return false
  await ctx.db.patch(deck._id, {
    identityColors: next.identityColors,
    commanderNames: next.commanderNames,
  })
  return true
}
