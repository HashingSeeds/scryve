import { translate } from "@/i18n/translate"

import { addCommander, selectCommander, type CommanderSelectionDetails } from "./commanderSelection"
import { cardSection, printingKey, type DeckCard } from "./deckCards"
import { canonicalDecklist } from "../../../convex/lib/deckFingerprint"
import { deckSections } from "../../../convex/lib/deckGames"
import { MAX_DECK_CARDS } from "../../../convex/lib/policy"
import { identitySection } from "../../../convex/lib/systems"

export const MAX_CARD_COPIES = 999

export type CardDetailsLookup<T extends DeckCard = DeckCard> = (
  card: T,
) => CommanderSelectionDetails | undefined

type DeckRules = { game: string; format: string }

export type DeckDraft = {
  editing: boolean
  cards: DeckCard[]
  base: DeckCard[]
  note: string
  metadataRevision?: number
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

export function closeDeckDraft(draft: DeckDraft): DeckDraft {
  return { ...draft, editing: false, undo: undefined }
}

export function reseedDeckDraft(draft: DeckDraft, cards: DeckCard[]): DeckDraft {
  return { ...draft, cards, base: cards, fromCache: false }
}

export function draftChanges(draft: DeckDraft, savedNote: string | undefined) {
  const cards = draft.editing && !draft.fromCache && cardsChanged(draft.cards, draft.base)
  const note = draft.editing && draft.note !== (savedNote ?? "")
  return { cards, note, any: cards || note }
}

export function startsNewList(base: readonly DeckCard[], cards: readonly DeckCard[], game: string) {
  const fingerprintCards = (list: readonly DeckCard[]) =>
    list.map((card) => ({ ...card, game: card.game ?? game }))
  return canonicalDecklist(fingerprintCards(base)) !== canonicalDecklist(fingerprintCards(cards))
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

function adjustCardQuantity<T extends DeckCard>(cards: readonly T[], card: T, delta: number) {
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

function cardLimitError(cards: readonly DeckCard[], card: DeckCard) {
  const existing = cards.find((entry) => printingKey(entry) === printingKey(card))
  if (existing && existing.quantity >= MAX_CARD_COPIES)
    return translate("decks:draft.copyLimit", { limit: MAX_CARD_COPIES })
  if (!existing && cards.length >= MAX_DECK_CARDS)
    return translate("decks:draft.entryLimit", { limit: MAX_DECK_CARDS })
  return undefined
}

function addCopy<T extends DeckCard>(cards: readonly T[], card: T) {
  const error = cardLimitError(cards, card)
  if (error) return { error }
  return {
    cards: cards.some((entry) => printingKey(entry) === printingKey(card))
      ? adjustCardQuantity(cards, card, 1)
      : [...cards, card],
  }
}

export function isCommanderPick(deck: DeckRules, card: DeckCard) {
  return identitySection(deck.game, deck.format)?.id === cardSection(card)
}

export function sideboardSection(deck: DeckRules) {
  return deckSections(deck.game, deck.format).find(
    (section) => section.id === "sideboard" || section.id === "side",
  )
}

export function moveTarget(deck: DeckRules, card: DeckCard) {
  const side = sideboardSection(deck)?.id
  const section = cardSection(card)
  if (!side) return undefined
  if (section === "main") return side
  return section === side ? "main" : undefined
}

function moveCopy<T extends DeckCard>(
  cards: readonly T[],
  entry: T,
  section: string,
): { cards: T[] } | { error: string } {
  const copy: T = {
    ...entry,
    quantity: 1,
    section,
    ...(entry.board ? ({ board: section === "sideboard" ? "sideboard" : "main" } as const) : {}),
  }
  const merges = cards.some((card) => printingKey(card) === printingKey(copy))
  // why: a lone copy keeps its place in the list, so moving it back leaves the draft clean.
  if (!merges && entry.quantity === 1)
    return { cards: cards.map((card) => (card === entry ? copy : card)) }
  const added = addCopy(cards, copy)
  if ("error" in added) return added
  return { cards: adjustCardQuantity(added.cards, entry, -1) }
}

export function canChooseCommander(deck: DeckRules, cards: readonly DeckCard[]) {
  const identity = identitySection(deck.game, deck.format)
  return (
    identity?.id === "commander" &&
    cards.reduce(
      (count, card) => count + (cardSection(card) === identity.id ? card.quantity : 0),
      0,
    ) <= 1
  )
}

function addIdentityCard<T extends DeckCard>(
  cards: readonly T[],
  card: T,
  detailsFor: CardDetailsLookup<T>,
) {
  const section = cardSection(card)
  const result =
    section === "commander"
      ? addCommander(cards, card, detailsFor, card.commanderColor)
      : {
          cards: [
            ...cards.filter((entry) => cardSection(entry) !== section),
            { ...card, quantity: 1 },
          ],
        }
  if ("error" in result) return result
  if (result.cards.length > MAX_DECK_CARDS)
    return { error: translate("decks:draft.entryLimit", { limit: MAX_DECK_CARDS }) }
  return { cards: result.cards }
}

export type DeckEdits<Card extends DeckCard = DeckCard> = {
  cards: Card[]
  note?: string
  undo?: { name: string; cards: Card[] }
  commanderSelected?: boolean
}

export type DeckEdit<Card extends DeckCard = DeckCard> =
  | { type: "add"; card: Card }
  | { type: "remove"; card: Card }
  | {
      type: "chooseCommander"
      card: Card
      details?: CommanderSelectionDetails
      color?: Card["commanderColor"]
    }
  | { type: "move"; card: Card }
  | { type: "undo" }
  | { type: "note"; note: string }

export function editDeck<Draft extends DeckEdits>(
  draft: Draft,
  edit: DeckEdit<Draft["cards"][number]>,
  deck: DeckRules & { detailsFor: CardDetailsLookup<Draft["cards"][number]> },
): Draft | { error: string } {
  switch (edit.type) {
    case "add": {
      const pick = isCommanderPick(deck, edit.card)
      const result = pick
        ? addIdentityCard(draft.cards, edit.card, deck.detailsFor)
        : addCopy(draft.cards, edit.card)
      if ("error" in result) return result
      return {
        ...draft,
        cards: result.cards,
        undo: undefined,
        ...(pick ? { commanderSelected: true } : {}),
      }
    }
    case "remove": {
      const entry = draft.cards.find((card) => printingKey(card) === printingKey(edit.card))
      if (!entry) return draft
      return {
        ...draft,
        cards: adjustCardQuantity(draft.cards, entry, -1),
        undo: entry.quantity === 1 ? { name: entry.name, cards: draft.cards } : undefined,
      }
    }
    case "move": {
      const entry = draft.cards.find((card) => printingKey(card) === printingKey(edit.card))
      const section = entry && moveTarget(deck, entry)
      if (!entry || !section) return draft
      const result = moveCopy(draft.cards, entry, section)
      if ("error" in result) return result
      return { ...draft, cards: result.cards, undo: undefined }
    }
    case "chooseCommander": {
      const key = printingKey(edit.card)
      const result = selectCommander(
        draft.cards,
        key,
        (card) =>
          edit.details && printingKey(card) === key ? edit.details : deck.detailsFor(card),
        edit.color,
      )
      if ("error" in result) return result
      return { ...draft, cards: result.cards, undo: undefined, commanderSelected: true }
    }
    case "undo":
      return draft.undo ? { ...draft, cards: draft.undo.cards, undo: undefined } : draft
    case "note":
      return { ...draft, note: edit.note }
  }
}

type SaveTarget = "queue" | "mutation" | "none"

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
