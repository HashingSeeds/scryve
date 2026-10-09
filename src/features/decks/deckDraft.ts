import { addCommander, selectCommander, type CommanderSelectionDetails } from "./commanderSelection"
import { cardSection, printingKey, type DeckCard } from "./deckCards"
import { MAX_DECK_CARDS } from "../../../convex/lib/policy"

export const MAX_CARD_COPIES = 999

export type CardDetailsLookup<T extends DeckCard = DeckCard> = (
  card: T,
) => CommanderSelectionDetails | undefined

type DeckRules = { game: string; format: string }

export type DeckDraft = {
  editing: boolean
  cards: DeckCard[]
  // why: dirty compares against the list the edit started from, not whatever the server sends mid-edit.
  base: DeckCard[]
  note: string
  metadataRevision?: number
  // why: an edit opened before any version cards loaded is re-seeded once they arrive and is never dirty until then.
  fromCache: boolean
  undo?: { name: string; cards: DeckCard[] }
  commanderSelected: boolean
}

export const closedDeckDraft: DeckDraft = {
  editing: false,
  cards: [],
  base: [],
  note: "",
  fromCache: false,
  commanderSelected: false,
}

export function openDeckDraft(start: {
  cards: DeckCard[]
  note: string
  metadataRevision?: number
  fromCache: boolean
}): DeckDraft {
  return { ...closedDeckDraft, ...start, editing: true, base: start.cards }
}

/** why: a saved draft keeps its cards and commander choice so warnings stay visible after save. */
export function closeDeckDraft(draft: DeckDraft): DeckDraft {
  return { ...draft, editing: false, undo: undefined }
}

export function reseedDeckDraft(draft: DeckDraft, cards: DeckCard[]): DeckDraft {
  return { ...draft, cards, base: cards, fromCache: false }
}

export function setDraftNote(draft: DeckDraft, note: string): DeckDraft {
  return { ...draft, note }
}

export function draftChanges(draft: DeckDraft, savedNote: string | undefined) {
  const cards = draft.editing && !draft.fromCache && cardsChanged(draft.cards, draft.base)
  const note = draft.editing && draft.note !== (savedNote ?? "")
  return { cards, note, any: cards || note }
}

export function cardsChanged(cards: readonly DeckCard[], base: readonly DeckCard[]) {
  return (
    cards.length !== base.length ||
    cards.some(
      (card, index) =>
        printingKey(card) !== printingKey(base[index]) ||
        card.quantity !== base[index].quantity ||
        card.commanderColor !== base[index].commanderColor,
    )
  )
}

export function adjustCardQuantity<T extends DeckCard>(
  cards: readonly T[],
  card: T,
  delta: number,
) {
  return cards.flatMap((entry) =>
    printingKey(entry) !== printingKey(card)
      ? [entry]
      : entry.quantity + delta > 0
        ? [
            {
              ...entry,
              quantity:
                delta > 0
                  ? Math.min(MAX_CARD_COPIES, entry.quantity + delta)
                  : entry.quantity + delta,
            },
          ]
        : [],
  )
}

export function incrementCard<T extends DeckCard>(cards: readonly T[], card: T) {
  return cards.some((entry) => printingKey(entry) === printingKey(card))
    ? adjustCardQuantity(cards, card, 1)
    : [...cards, card]
}

export function addDraftCard(draft: DeckDraft, card: DeckCard): DeckDraft {
  return { ...draft, cards: incrementCard(draft.cards, card), undo: undefined }
}

/** why: removing the last copy offers undo, so a mis-tap never loses a card silently. */
export function removeDraftCard(draft: DeckDraft, card: DeckCard): DeckDraft {
  return {
    ...draft,
    cards: adjustCardQuantity(draft.cards, card, -1),
    undo: card.quantity === 1 ? { name: card.name, cards: draft.cards } : undefined,
  }
}

export function restoreDraftUndo(draft: DeckDraft): DeckDraft {
  return draft.undo ? { ...draft, cards: draft.undo.cards, undo: undefined } : draft
}

export function cardLimitError(cards: readonly DeckCard[], card: DeckCard) {
  const existing = cards.find((entry) => printingKey(entry) === printingKey(card))
  if (existing && existing.quantity >= MAX_CARD_COPIES)
    return `A card can have at most ${MAX_CARD_COPIES} copies.`
  if (!existing && cards.length >= MAX_DECK_CARDS)
    return `A deck can have at most ${MAX_DECK_CARDS} entries.`
  return undefined
}

function isCommanderDeck(deck: DeckRules) {
  return deck.game === "mtg" && deck.format === "commander"
}

export function isCommanderPick(deck: DeckRules, card: DeckCard) {
  return isCommanderDeck(deck) && cardSection(card) === "commander"
}

/** why: commander changes support exactly one commander; partner pairs stay read-only for now. */
export function canChooseCommander(deck: DeckRules, cards: readonly DeckCard[]) {
  return (
    isCommanderDeck(deck) &&
    cards.reduce(
      (count, card) => count + (cardSection(card) === "commander" ? card.quantity : 0),
      0,
    ) <= 1
  )
}

export function addCommanderCard<T extends DeckCard>(
  cards: readonly T[],
  card: T,
  detailsFor: CardDetailsLookup<T>,
) {
  const result = addCommander(cards, card, detailsFor, card.commanderColor)
  if ("error" in result) return result
  if (result.cards.length > MAX_DECK_CARDS)
    return { error: `A deck can have at most ${MAX_DECK_CARDS} entries.` }
  return { cards: result.cards }
}

export function addDraftCommander(
  draft: DeckDraft,
  card: DeckCard,
  detailsFor: CardDetailsLookup,
): DeckDraft | { error: string } {
  const result = addCommanderCard(draft.cards, card, detailsFor)
  if ("error" in result) return result
  return { ...draft, cards: result.cards, undo: undefined, commanderSelected: true }
}

export function chooseDraftCommander(
  draft: DeckDraft,
  selectedKey: string,
  detailsFor: CardDetailsLookup,
  commanderColor?: DeckCard["commanderColor"],
): DeckDraft | { error: string } {
  const result = selectCommander(draft.cards, selectedKey, detailsFor, commanderColor)
  if ("error" in result) return result
  return { ...draft, cards: result.cards, undo: undefined, commanderSelected: true }
}

type SaveTarget = "queue" | "mutation" | "none"

/** why: queued writes never wait on the network, so an `immediate` save skips the busy state and access prompt. */
export function planDeckSave(input: {
  changes: { cards: boolean; note: boolean }
  canQueueCards: boolean
  canQueueNote: boolean
}) {
  const cards: SaveTarget = input.changes.cards
    ? input.canQueueCards
      ? "queue"
      : "mutation"
    : "none"
  const note: SaveTarget = input.changes.note ? (input.canQueueNote ? "queue" : "mutation") : "none"
  return { cards, note, immediate: cards === "queue" || (cards === "none" && note === "queue") }
}
