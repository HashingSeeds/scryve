import type { CommanderSelectionDetails } from "./commanderSelection"
import { cardSection, type DeckCard } from "./deckCards"
import {
  canChooseCommander,
  closeDeckDraft,
  draftChanges,
  editDeck,
  isCommanderPick,
  openDeckDraft,
  planDeckSave,
  reseedDeckDraft,
  startsNewList,
  type DeckDraft,
  type DeckEdit,
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
const partner: CommanderSelectionDetails = { ...eligible, oracleText: "Partner" }
const entries = (count: number) =>
  Array.from({ length: count }, (_, index) => card(`Card ${index}`))
const open = (cards: DeckCard[], note = "") => openDeckDraft({ cards, note, fromCache: false })

type Rules = { game: string; format: string; details?: CommanderSelectionDetails }
const modern: Rules = { game: "mtg", format: "modern" }
const commander: Rules = { game: "mtg", format: "commander", details: eligible }

function edit(draft: DeckDraft, change: DeckEdit, { details, ...deck }: Rules = modern) {
  return editDeck(draft, change, { ...deck, detailsFor: () => details })
}

function apply(draft: DeckDraft, changes: DeckEdit[], rules: Rules = modern) {
  return changes.reduce((current, change) => {
    const next = edit(current, change, rules)
    if ("error" in next) throw new Error(next.error)
    return next
  }, draft)
}

const summary = (draft: DeckDraft) =>
  draft.cards.map((entry) => `${entry.quantity} ${cardSection(entry)}:${entry.name}`)

describe("deck draft lifecycle", () => {
  it("is clean when opened and dirty once a count changes", () => {
    const draft = open([card("Sol Ring")], "Ramp")
    expect(draftChanges(draft, "Ramp")).toEqual({ cards: false, note: false, any: false })
    const added = apply(draft, [{ type: "add", card: card("Sol Ring") }])
    expect(draftChanges(added, "Ramp")).toEqual({ cards: true, note: false, any: true })
  })

  it("treats a commander color change as a card change", () => {
    const pick = card("Esika", { section: "commander", commanderColor: "G" })
    const draft = open([pick])
    expect(draftChanges({ ...draft, cards: [{ ...pick, commanderColor: "U" }] }, "").cards).toBe(
      true,
    )
  })

  it("tracks note edits against the saved note", () => {
    const draft = apply(open([], "Old"), [{ type: "note", note: "New" }])
    expect(draftChanges(draft, "Old")).toEqual({ cards: false, note: true, any: true })
    expect(draftChanges(apply(draft, [{ type: "note", note: "Old" }]), "Old").any).toBe(false)
  })

  it("is never dirty while closed or while waiting on cached cards", () => {
    const island = { type: "add", card: card("Island") } as const
    const fromCache = openDeckDraft({ cards: [], note: "", fromCache: true })
    expect(draftChanges(apply(fromCache, [island]), "").cards).toBe(false)
    expect(draftChanges(closeDeckDraft(apply(open([]), [island])), "").any).toBe(false)
  })

  it("re-seeds a cache-origin draft so it starts clean against the live list", () => {
    const live = [card("Island", { quantity: 3 })]
    const draft = reseedDeckDraft(openDeckDraft({ cards: [], note: "", fromCache: true }), live)
    expect(draft).toMatchObject({ cards: live, base: live, fromCache: false })
    expect(draftChanges(draft, "").cards).toBe(false)
  })
})

describe("editDeck", () => {
  it("adds a copy of a card already in the deck and a new printing as its own entry", () => {
    const draft = apply(open([card("Island")]), [
      { type: "add", card: card("Island") },
      { type: "add", card: card("Swamp") },
    ])
    expect(summary(draft)).toEqual(["2 main:Island", "1 main:Swamp"])
  })

  it("keeps the same printing in different sections apart", () => {
    const draft = apply(open([card("Island"), card("Island", { section: "sideboard" })]), [
      { type: "add", card: card("Island", { section: "sideboard" }) },
    ])
    expect(summary(draft)).toEqual(["1 main:Island", "2 sideboard:Island"])
  })

  it("offers undo only when the last copy is removed, and restores the list", () => {
    const start = open([card("Island", { quantity: 2 }), card("Swamp")])
    const decreased = apply(start, [{ type: "remove", card: card("Island") }])
    expect(summary(decreased)).toEqual(["1 main:Island", "1 main:Swamp"])
    expect(decreased.undo).toBeUndefined()

    const removed = apply(decreased, [{ type: "remove", card: card("Swamp") }])
    expect(summary(removed)).toEqual(["1 main:Island"])
    expect(removed.undo).toEqual({ name: "Swamp", cards: decreased.cards })
    expect(apply(removed, [{ type: "undo" }])).toMatchObject({
      cards: decreased.cards,
      undo: undefined,
    })
  })

  it("counts copies in the deck, not in the removed candidate, when offering undo", () => {
    const draft = apply(open([card("Island", { quantity: 3 })]), [
      { type: "remove", card: card("Island", { quantity: 1 }) },
    ])
    expect(summary(draft)).toEqual(["2 main:Island"])
    expect(draft.undo).toBeUndefined()
  })

  it("ignores removing a card the deck does not have", () => {
    const draft = open([card("Island")])
    expect(edit(draft, { type: "remove", card: card("Swamp") })).toBe(draft)
  })

  it("clears undo on the next add and when the draft closes", () => {
    const removed = apply(open([card("Swamp")]), [{ type: "remove", card: card("Swamp") }])
    expect(apply(removed, [{ type: "add", card: card("Island") }]).undo).toBeUndefined()
    expect(closeDeckDraft(removed).undo).toBeUndefined()
  })

  it("stops a copy past 999 and decrements a merged entry above it by one", () => {
    const rats = card("Relentless Rats", { quantity: 999 })
    expect(edit(open([rats]), { type: "add", card: rats })).toEqual({
      error: "A card can have at most 999 copies.",
    })
    const merged = open([{ ...rats, quantity: 1500 }])
    expect(summary(apply(merged, [{ type: "remove", card: rats }]))).toEqual([
      "1499 main:Relentless Rats",
    ])
  })

  it(`stops a new entry at ${MAX_DECK_CARDS} entries but still allows more copies`, () => {
    const full = open(entries(MAX_DECK_CARDS))
    expect(edit(full, { type: "add", card: card("One more") })).toEqual({
      error: `A deck can have at most ${MAX_DECK_CARDS} entries.`,
    })
    expect(edit(full, { type: "add", card: full.cards[0] })).not.toHaveProperty("error")
  })
})

describe("editDeck move", () => {
  const move = (target: DeckCard) => ({ type: "move", card: target }) as const

  it("moves one copy between main and sideboard, and back leaves the draft clean", () => {
    const start = open([card("Bolt", { quantity: 4 }), card("Path")])
    const out = apply(start, [move(card("Bolt")), move(card("Path"))])
    expect(summary(out)).toEqual(["3 main:Bolt", "1 sideboard:Path", "1 sideboard:Bolt"])

    const back = apply(out, [
      move(card("Bolt", { section: "sideboard" })),
      move(card("Path", { section: "sideboard" })),
    ])
    expect(summary(back)).toEqual(["4 main:Bolt", "1 main:Path"])
    expect(draftChanges(back, "").cards).toBe(false)
  })

  it("is clean after a round trip that reorders the list", () => {
    const start = open([card("Bolt"), card("Path"), card("Bolt", { section: "sideboard" })])
    const out = apply(start, [move(card("Bolt"))])
    const back = apply(out, [move(card("Bolt", { section: "sideboard" }))])
    expect(summary(back)).toEqual(["1 main:Path", "1 sideboard:Bolt", "1 main:Bolt"])
    expect(draftChanges(back, "").cards).toBe(false)
  })

  it("keeps the board field in step for Magic cards", () => {
    const legacy = card("Bolt", { board: "main" })
    const moved = apply(open([legacy]), [move(legacy)])
    expect(moved.cards).toEqual([card("Bolt", { board: "sideboard" })])
    expect(apply(moved, [move(moved.cards[0])]).cards).toEqual([legacy])
  })

  it("uses the Side Deck in Yu-Gi-Oh and does nothing where there is no sideboard", () => {
    const ygo = { game: "ygo", format: "advanced" }
    expect(summary(apply(open([card("Ash")]), [move(card("Ash"))], ygo))).toEqual(["1 side:Ash"])

    const pokemon = open([card("Pikachu", { quantity: 2 })])
    expect(edit(pokemon, move(card("Pikachu")), { game: "pokemon", format: "standard" })).toBe(
      pokemon,
    )
    const extra = open([card("Dragon", { section: "extra" })])
    expect(edit(extra, move(card("Dragon", { section: "extra" })), ygo)).toBe(extra)
  })

  it("stops at the copy limit without losing the source copy", () => {
    const draft = open([card("Rats"), card("Rats", { section: "sideboard", quantity: 999 })])
    expect(edit(draft, move(card("Rats")))).toEqual({
      error: "A card can have at most 999 copies.",
    })
  })
})

describe("editDeck commanders", () => {
  it("applies Commander rules only to Magic Commander decks", () => {
    const pick = card("Talrand", { section: "commander" })
    expect(isCommanderPick(commander, pick)).toBe(true)
    expect(isCommanderPick(modern, pick)).toBe(false)
    expect(isCommanderPick(commander, card("Island"))).toBe(false)
  })

  it("allows choosing a commander only with at most one in the deck", () => {
    const partners = [
      card("Thrasios", { section: "commander" }),
      card("Tymna", { section: "commander" }),
    ]
    expect(canChooseCommander(commander, [partners[0]])).toBe(true)
    expect(canChooseCommander(commander, partners)).toBe(false)
    expect(canChooseCommander({ game: "ygo", format: "commander" }, [])).toBe(false)
  })

  it("adds a searched commander, demotes the old one, and marks the choice", () => {
    const draft = apply(
      open([card("Old", { section: "commander" })]),
      [{ type: "add", card: card("Talrand", { section: "commander" }) }],
      commander,
    )
    expect(summary(draft)).toEqual(["1 main:Old", "1 commander:Talrand"])
    expect(draft.commanderSelected).toBe(true)
  })

  it("pairs a searched partner with the current commander", () => {
    const draft = apply(
      open([card("Thrasios", { section: "commander" })]),
      [{ type: "add", card: card("Tymna", { section: "commander" }) }],
      { ...commander, details: partner },
    )
    expect(summary(draft)).toEqual(["1 commander:Thrasios", "1 commander:Tymna"])
  })

  it("promotes a card already in the draft with the focused card's details", () => {
    const draft = open([card("Old", { section: "commander" }), card("New", { quantity: 2 })])
    const next = apply(
      draft,
      [{ type: "chooseCommander", card: draft.cards[1], details: eligible }],
      { ...commander, details: undefined },
    )
    expect(next.commanderSelected).toBe(true)
    expect(next.cards.find((entry) => cardSection(entry) === "commander")?.name).toBe("New")
    expect(next.cards.find((entry) => entry.name === "Old")).toMatchObject({ section: "main" })
  })

  it("returns the rule error and leaves the draft alone for an ineligible card", () => {
    const draft = open([card("Island")])
    expect(
      edit(
        draft,
        { type: "chooseCommander", card: draft.cards[0] },
        { ...commander, details: { commanderEligibility: "ineligible" } },
      ),
    ).toEqual({ error: "This card cannot be a commander." })
  })

  it("rejects a commander add that would push the deck past the entry limit", () => {
    expect(
      edit(
        open(entries(MAX_DECK_CARDS)),
        { type: "add", card: card("Talrand", { section: "commander" }) },
        commander,
      ),
    ).toEqual({ error: `A deck can have at most ${MAX_DECK_CARDS} entries.` })
  })

  it.each([
    ["Flesh and Blood hero", { game: "fab", format: "cc" }, "hero"],
    ["Riftbound legend", { game: "riftbound", format: "constructed" }, "legend"],
  ])("holds one %s, replacing it without the Commander picker", (_, deck, section) => {
    const pick = (name: string) => card(name, { scryfallId: undefined, cardId: name, section })
    const draft = open([pick("First"), card("Filler", { section: "main", quantity: 3 })])
    expect(isCommanderPick(deck, pick("Second"))).toBe(true)
    expect(canChooseCommander(deck, draft.cards)).toBe(false)
    expect(summary(apply(draft, [{ type: "add", card: pick("Second") }], deck))).toEqual([
      "3 main:Filler",
      `1 ${section}:Second`,
    ])
  })

  it.each([
    ["Pokémon", { game: "pokemon", format: "standard" }, "main"],
    ["Yu-Gi-Oh", { game: "ygo", format: "advanced" }, "extra"],
    ["Lorcana", { game: "lorcana", format: "core" }, "main"],
  ])("adds %s cards as plain copies", (_, deck, section) => {
    const entry = card("Card", { section })
    expect(summary(apply(open([entry]), [{ type: "add", card: entry }], deck))).toEqual([
      `2 ${section}:Card`,
    ])
  })
})

describe("planDeckSave", () => {
  it.each([
    [
      "queues card edits and lets the note follow whichever route it can",
      { changes: { cards: true, note: true }, canQueueCards: true, canQueueNote: false },
      { cards: "queue", note: "mutation", immediate: true },
    ],
    [
      "queues a note-only edit without waiting on the network",
      { changes: { cards: false, note: true }, canQueueCards: false, canQueueNote: true },
      { cards: "none", note: "queue", immediate: true },
    ],
    [
      "saves both parts through the server when sync is off",
      { changes: { cards: true, note: true }, canQueueCards: false, canQueueNote: false },
      { cards: "mutation", note: "mutation", immediate: false },
    ],
    [
      "writes nothing when the draft has no changes",
      { changes: { cards: false, note: false }, canQueueCards: true, canQueueNote: true },
      { cards: "none", note: "none", immediate: false },
    ],
    [
      "saves through the server when cards cannot queue",
      { changes: { cards: true, note: true }, canQueueCards: false, canQueueNote: true },
      { cards: "mutation", note: "queue", immediate: false },
    ],
  ])("%s", (_name, input, plan) => {
    expect(planDeckSave(input)).toEqual(plan)
  })
})

describe("startsNewList", () => {
  const base = [card("Forest", { cardId: "forest", quantity: 4 })]

  it.each([
    ["a quantity change", [card("Forest", { cardId: "forest", quantity: 5 })]],
    ["a new card", [...base, card("Island", { cardId: "island" })]],
    ["a section move", [card("Forest", { cardId: "forest", quantity: 4, board: "sideboard" })]],
    ["a commander color", [card("Forest", { cardId: "forest", quantity: 4, commanderColor: "G" })]],
  ])("is true for %s", (_, cards) => {
    expect(startsNewList(base, cards, "mtg")).toBe(true)
  })

  it("is false when only the printing changes", () => {
    const reprint = [
      card("Forest", { cardId: "forest", quantity: 4, scryfallId: "other-printing" }),
    ]
    expect(startsNewList(base, reprint, "mtg")).toBe(false)
  })
})
