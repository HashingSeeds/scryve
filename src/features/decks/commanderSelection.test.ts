import {
  addCommander,
  getCommanderWarnings,
  selectCommander,
  type CommanderSelectionDetails,
} from "./commanderSelection"
import { cardSection, printingKey, totalQuantity, type DeckCard } from "./deckCards"

const eligible: CommanderSelectionDetails = {
  commanderEligibility: "eligible",
  commanderLegality: "legal",
  colorIdentity: "U",
}
const card = (name: string, overrides: Partial<DeckCard> & { commanderColor?: string } = {}) => ({
  name,
  quantity: 1,
  scryfallId: name,
  ...overrides,
})

it("swaps one copy, merges the former commander into main, and preserves legacy boards and quantities", () => {
  const cards = [
    card("Old", { board: "commander", commanderColor: "R" }),
    card("Old", { section: "main", quantity: 2 }),
    card("New", { board: "main", quantity: 2 }),
  ]
  const result = selectCommander(cards, printingKey(cards[2]), () => eligible)
  if ("error" in result) throw new Error(result.error)
  expect(totalQuantity(result.cards)).toBe(totalQuantity(cards))
  expect(result.cards.find((entry) => entry.name === "Old")).toMatchObject({
    quantity: 3,
    section: "main",
    board: "main",
  })
  expect(result.cards.find((entry) => entry.name === "Old")?.commanderColor).toBeUndefined()
  expect(result.cards.find((entry) => cardSection(entry) === "commander")).toMatchObject({
    name: "New",
    quantity: 1,
    section: "commander",
    board: "commander",
  })
  expect(result.warnings).toContain("Another copy of this commander remains in the deck.")
  expect(cards[0].commanderColor).toBe("R")
})

it("preserves an already selected commander", () => {
  const cards = [card("New", { board: "commander" }), card("Other")]
  const result = selectCommander(cards, printingKey(cards[0]), () => eligible)
  if ("error" in result) throw new Error(result.error)
  expect(result.cards).toHaveLength(2)
  expect(result.warnings).toEqual([])
})

it("refuses to rewrite a deck with multiple commanders", () => {
  const cards = [card("Old", { board: "commander", quantity: 2 }), card("New")]
  expect(selectCommander(cards, printingKey(cards[1]), () => eligible)).toHaveProperty("error")
})

it.each([
  undefined,
  { ...eligible, commanderEligibility: undefined },
  { ...eligible, commanderEligibility: "ineligible" },
  { ...eligible, commanderLegality: "banned" },
  { ...eligible, commanderLegality: undefined },
])("refuses unconfirmed or disallowed commander metadata: %j", (details) => {
  const cards = [card("New")]
  expect(selectCommander(cards, printingKey(cards[0]), () => details)).toHaveProperty("error")
})

it("requires and records a pregame color choice", () => {
  const cards = [card("Piper"), card("Blue")]
  const detailsFor = (entry: DeckCard) =>
    entry.name === "Piper"
      ? { ...eligible, commanderEligibility: "color-choice", colorIdentity: "" }
      : eligible
  expect(selectCommander(cards, printingKey(cards[0]), detailsFor)).toHaveProperty("error")
  expect(selectCommander(cards, printingKey(cards[0]), detailsFor, "X")).toHaveProperty("error")
  const result = selectCommander(cards, printingKey(cards[0]), detailsFor, "U")
  if ("error" in result) throw new Error(result.error)
  expect(result.cards[0].commanderColor).toBe("U")
  expect(result.warnings).toEqual([])
})

it("warns about conflicting colors and missing details without deleting cards", () => {
  const cards = [card("New"), card("Red"), card("Unknown")]
  const result = selectCommander(cards, printingKey(cards[0]), (entry) => {
    if (entry.name === "Unknown") return undefined
    return entry.name === "Red" ? { ...eligible, colorIdentity: "R" } : eligible
  })
  if ("error" in result) throw new Error(result.error)
  expect(result.cards).toHaveLength(3)
  expect(result.warnings).toEqual([
    "Outside this commander's color identity: Red.",
    "Some card details are missing. Deck color identity has not been fully checked.",
  ])
})

it("flags Oracle duplicates across distinct printings without merging them", () => {
  const cards = [
    card("New", { oracleId: "same", scryfallId: "first" }),
    card("New", { oracleId: "same", scryfallId: "second" }),
  ]
  const result = selectCommander(cards, printingKey(cards[0]), () => eligible)
  if ("error" in result) throw new Error(result.error)
  expect(result.cards).toHaveLength(2)
  expect(result.warnings).toContain("Another copy of this commander remains in the deck.")
})

it("moves an existing catalog printing instead of adding another copy", () => {
  const cards = [card("Old", { board: "commander" }), card("New", { board: "sideboard" })]
  const result = addCommander(cards, card("New"), () => eligible)
  if ("error" in result) throw new Error(result.error)
  expect(totalQuantity(result.cards)).toBe(2)
  expect(result.cards.find((entry) => cardSection(entry) === "commander")?.name).toBe("New")
})

it("moves a different existing printing of the same Oracle card", () => {
  const cards = [card("New", { oracleId: "same", scryfallId: "old-printing" })]
  const result = addCommander(
    cards,
    card("New", { oracleId: "same", scryfallId: "catalog-printing" }),
    () => eligible,
  )
  if ("error" in result) throw new Error(result.error)
  expect(result.cards).toHaveLength(1)
  expect(result.cards[0].scryfallId).toBe("old-printing")
  expect(cardSection(result.cards[0])).toBe("commander")
})

it("prefers the matching printing when several printings share an Oracle identity", () => {
  const cards = [
    card("New", { oracleId: "same", scryfallId: "other" }),
    card("New", { oracleId: "same", scryfallId: "selected" }),
  ]
  const result = addCommander(
    cards,
    card("New", { oracleId: "same", scryfallId: "selected" }),
    () => eligible,
  )
  if ("error" in result) throw new Error(result.error)
  expect(result.cards.find((entry) => cardSection(entry) === "commander")?.scryfallId).toBe(
    "selected",
  )
})

it("adds exactly one new catalog card and returns the old commander to main", () => {
  const cards = [card("Old", { board: "commander" })]
  const result = addCommander(
    cards,
    card("New", { quantity: 20, board: "commander" }),
    () => eligible,
  )
  if ("error" in result) throw new Error(result.error)
  expect(totalQuantity(result.cards)).toBe(2)
  expect(result.cards.find((entry) => cardSection(entry) === "commander")).toMatchObject({
    name: "New",
    quantity: 1,
  })
  expect(cardSection(result.cards[0])).toBe("main")
})

it("rejects catalog additions without modifying the input deck", () => {
  const cards = [card("Old", { board: "commander", quantity: 2 })]
  const before = cards.map((entry) => ({ ...entry }))
  expect(addCommander(cards, card("New"), () => eligible)).toHaveProperty("error")
  expect(cards).toEqual(before)
  expect(
    addCommander([], card("New"), () => ({ ...eligible, commanderLegality: "banned" })),
  ).toHaveProperty("error")
})

it("retains the original authoritative section and clears stale color on leftover copies", () => {
  const cards = [
    card("New", { section: "sideboard", board: "commander", quantity: 2, commanderColor: "R" }),
  ]
  const result = selectCommander(cards, printingKey(cards[0]), () => eligible)
  if ("error" in result) throw new Error(result.error)
  expect(result.cards[0]).toMatchObject({ section: "sideboard", board: "sideboard", quantity: 1 })
  expect(result.cards[0].commanderColor).toBeUndefined()
})

it("rejects swaps that would create an unsavable entry quantity", () => {
  const cards = [card("Old", { board: "commander" }), card("Old", { quantity: 999 }), card("New")]
  expect(selectCommander(cards, printingKey(cards[2]), () => eligible)).toHaveProperty("error")
  expect(cards[1].quantity).toBe(999)
})

it("bounds color-conflict warnings to three distinct names and a remainder count", () => {
  const cards = [
    card("New"),
    ...["Red A", "Red B", "Red C", "Red D", "Red E"].map((name) => card(name)),
    card("Red A", { scryfallId: "another-printing" }),
  ]
  const result = selectCommander(cards, printingKey(cards[0]), (entry) =>
    entry.name === "New" ? eligible : { ...eligible, colorIdentity: "R" },
  )
  if ("error" in result) throw new Error(result.error)
  expect(result.warnings).toEqual([
    "Outside this commander's color identity: Red A, Red B, Red C and 2 more.",
  ])
})

it("recomputes warnings from current cards after removing or adding conflicts", () => {
  const commander = card("New", { section: "commander", commanderColor: "U" })
  const red = card("Red")
  const detailsFor = (entry: DeckCard) =>
    entry.name === "New"
      ? { ...eligible, commanderEligibility: "color-choice", colorIdentity: "" }
      : { ...eligible, colorIdentity: "R" }
  expect(getCommanderWarnings([commander, red], detailsFor)).toEqual([
    "Outside this commander's color identity: Red.",
  ])
  expect(getCommanderWarnings([commander], detailsFor)).toEqual([])
  expect(getCommanderWarnings([commander, red], detailsFor)).toEqual([
    "Outside this commander's color identity: Red.",
  ])
  expect(getCommanderWarnings([red], detailsFor)).toEqual([])
})
