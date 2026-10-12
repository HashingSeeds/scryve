import type { CommanderSelectionDetails } from "./commanderSelection"
import { cardSection, printingKey, type DeckCard } from "./deckCards"
import {
  addCommanderCard,
  addDraftCard,
  addDraftCommander,
  adjustCardQuantity,
  canChooseCommander,
  cardLimitError,
  chooseDraftCommander,
  closeDeckDraft,
  draftChanges,
  incrementCard,
  isCommanderPick,
  openDeckDraft,
  planDeckSave,
  removeDraftCard,
  reseedDeckDraft,
  restoreDraftUndo,
  setDraftNote,
} from "./deckDraft"
import { MAX_DECK_CARDS } from "../../../convex/lib/policy"

const card = (name: string, overrides: Partial<DeckCard> = {}): DeckCard => ({
  name,
  quantity: 1,
  scryfallId: name,
  ...overrides,
})
const eligible: CommanderSelectionDetails = {
  commanderEligibility: "eligible",
  commanderLegality: "legal",
  colorIdentity: "U",
}
const commanderDeck = { game: "mtg", format: "commander" }
const entries = (count: number) =>
  Array.from({ length: count }, (_, index) => card(`Card ${index}`))
const open = (cards: DeckCard[], note = "") => openDeckDraft({ cards, note, fromCache: false })

describe("deck draft editing", () => {
  it("is clean when opened and dirty once a count changes", () => {
    const draft = open([card("Sol Ring")], "Ramp")
    expect(draftChanges(draft, "Ramp")).toEqual({ cards: false, note: false, any: false })
    const added = addDraftCard(draft, card("Sol Ring"))
    expect(added.cards).toEqual([card("Sol Ring", { quantity: 2 })])
    expect(draftChanges(added, "Ramp")).toEqual({ cards: true, note: false, any: true })
  })

  it("treats a commander color change as a card change", () => {
    const commander = card("Esika", { section: "commander", commanderColor: "G" })
    const draft = open([commander])
    expect(
      draftChanges({ ...draft, cards: [{ ...commander, commanderColor: "U" }] }, "").cards,
    ).toBe(true)
  })

  it("tracks note edits against the saved note", () => {
    const draft = setDraftNote(open([], "Old"), "New")
    expect(draftChanges(draft, "Old")).toEqual({ cards: false, note: true, any: true })
    expect(draftChanges(setDraftNote(draft, "Old"), "Old").any).toBe(false)
  })

  it("is never dirty while closed or while waiting on cached cards", () => {
    const fromCache = openDeckDraft({ cards: [], note: "", fromCache: true })
    expect(draftChanges(addDraftCard(fromCache, card("Island")), "").cards).toBe(false)
    expect(draftChanges(closeDeckDraft(addDraftCard(open([]), card("Island"))), "").any).toBe(false)
  })

  it("re-seeds a cache-origin draft so it starts clean against the live list", () => {
    const live = [card("Island", { quantity: 3 })]
    const draft = reseedDeckDraft(openDeckDraft({ cards: [], note: "", fromCache: true }), live)
    expect(draft).toMatchObject({ cards: live, base: live, fromCache: false })
    expect(draftChanges(draft, "").cards).toBe(false)
  })

  it("adds a new printing as its own entry", () => {
    const draft = addDraftCard(open([card("Island")]), card("Swamp"))
    expect(draft.cards.map((entry) => entry.name)).toEqual(["Island", "Swamp"])
  })

  it("offers undo only when the last copy is removed", () => {
    const start = open([card("Island", { quantity: 2 }), card("Swamp")])
    const decreased = removeDraftCard(start, start.cards[0])
    expect(decreased.cards[0].quantity).toBe(1)
    expect(decreased.undo).toBeUndefined()

    const removed = removeDraftCard(decreased, decreased.cards[1])
    expect(removed.cards.map((entry) => entry.name)).toEqual(["Island"])
    expect(removed.undo).toEqual({ name: "Swamp", cards: decreased.cards })
    expect(restoreDraftUndo(removed)).toMatchObject({ cards: decreased.cards, undo: undefined })
  })

  it("clears undo on the next add and when the draft closes", () => {
    const removed = removeDraftCard(open([card("Swamp")]), card("Swamp"))
    expect(addDraftCard(removed, card("Island")).undo).toBeUndefined()
    expect(closeDeckDraft(removed).undo).toBeUndefined()
  })

  it("keeps the same printing in different sections apart", () => {
    const cards = [card("Island"), card("Island", { section: "sideboard" })]
    expect(incrementCard(cards, cards[1]).map((entry) => entry.quantity)).toEqual([1, 2])
  })

  it("caps a count at 999 copies and drops an entry at zero", () => {
    const cards = [card("Relentless Rats", { quantity: 998 })]
    expect(adjustCardQuantity(cards, cards[0], 5)[0].quantity).toBe(999)
    expect(adjustCardQuantity(cards, cards[0], -998)).toEqual([])
  })

  it("decrements a merged entry above 999 by one copy", () => {
    const cards = [card("Relentless Rats", { quantity: 1500 })]
    expect(adjustCardQuantity(cards, cards[0], -1)[0].quantity).toBe(1499)
  })
})

describe("deck draft limits", () => {
  it(`stops a new entry at ${MAX_DECK_CARDS} entries but still allows more copies`, () => {
    const full = entries(MAX_DECK_CARDS)
    expect(cardLimitError(full, card("One more"))).toBe(
      `A deck can have at most ${MAX_DECK_CARDS} entries.`,
    )
    expect(cardLimitError(full, full[0])).toBeUndefined()
    expect(cardLimitError(entries(MAX_DECK_CARDS - 1), card("Last"))).toBeUndefined()
  })

  it("stops a copy past 999", () => {
    const cards = [card("Relentless Rats", { quantity: 999 })]
    expect(cardLimitError(cards, cards[0])).toBe("A card can have at most 999 copies.")
  })

  it("rejects a commander add that would push the deck past the entry limit", () => {
    const result = addCommanderCard(
      entries(MAX_DECK_CARDS),
      card("Talrand", { section: "commander" }),
      () => eligible,
    )
    expect(result).toEqual({ error: `A deck can have at most ${MAX_DECK_CARDS} entries.` })
  })
})

describe("deck draft commander", () => {
  it("applies Commander rules only to Magic Commander decks", () => {
    const pick = card("Talrand", { section: "commander" })
    expect(isCommanderPick(commanderDeck, pick)).toBe(true)
    expect(isCommanderPick({ game: "mtg", format: "modern" }, pick)).toBe(false)
    expect(isCommanderPick(commanderDeck, card("Island"))).toBe(false)
  })

  it("allows choosing a commander only with at most one in the deck", () => {
    const partners = [
      card("Thrasios", { section: "commander" }),
      card("Tymna", { section: "commander" }),
    ]
    expect(canChooseCommander(commanderDeck, [partners[0]])).toBe(true)
    expect(canChooseCommander(commanderDeck, partners)).toBe(false)
    expect(canChooseCommander({ game: "ygo", format: "commander" }, [])).toBe(false)
  })

  it("promotes a card already in the draft and marks the choice", () => {
    const draft = open([card("Old", { section: "commander" }), card("New", { quantity: 2 })])
    const next = chooseDraftCommander(draft, printingKey(draft.cards[1]), () => eligible)
    if ("error" in next) throw new Error(next.error)
    expect(next.commanderSelected).toBe(true)
    expect(next.cards.find((entry) => cardSection(entry) === "commander")?.name).toBe("New")
    expect(next.cards.find((entry) => entry.name === "Old")).toMatchObject({ section: "main" })
  })

  it("returns the rule error and leaves the draft alone for an ineligible card", () => {
    const draft = open([card("Island")])
    expect(
      chooseDraftCommander(draft, printingKey(draft.cards[0]), () => ({
        commanderEligibility: "ineligible",
      })),
    ).toEqual({ error: "This card cannot be a commander." })
  })

  it("adds a searched commander and demotes the old one", () => {
    const draft = open([card("Old", { section: "commander" })])
    const next = addDraftCommander(draft, card("Talrand", { section: "commander" }), () => eligible)
    if ("error" in next) throw new Error(next.error)
    expect(next.cards.map((entry) => `${cardSection(entry)}:${entry.name}`)).toEqual([
      "main:Old",
      "commander:Talrand",
    ])
  })
})

describe("planDeckSave", () => {
  it("queues card edits and lets the note follow whichever route it can", () => {
    expect(
      planDeckSave({
        changes: { cards: true, note: true },
        canQueueCards: true,
        canQueueNote: false,
      }),
    ).toEqual({ cards: "queue", note: "mutation", immediate: true })
  })

  it("queues a note-only edit without waiting on the network", () => {
    expect(
      planDeckSave({
        changes: { cards: false, note: true },
        canQueueCards: false,
        canQueueNote: true,
      }),
    ).toEqual({ cards: "none", note: "queue", immediate: true })
  })

  it("saves both parts through the server when sync is off", () => {
    expect(
      planDeckSave({
        changes: { cards: true, note: true },
        canQueueCards: false,
        canQueueNote: false,
      }),
    ).toEqual({ cards: "mutation", note: "mutation", immediate: false })
  })

  it("writes nothing when the draft has no changes", () => {
    expect(
      planDeckSave({
        changes: { cards: false, note: false },
        canQueueCards: true,
        canQueueNote: true,
      }),
    ).toEqual({ cards: "none", note: "none", immediate: false })
  })

  it("saves through the server when cards cannot queue", () => {
    expect(
      planDeckSave({
        changes: { cards: true, note: true },
        canQueueCards: false,
        canQueueNote: true,
      }),
    ).toEqual({ cards: "mutation", note: "queue", immediate: false })
  })
})
