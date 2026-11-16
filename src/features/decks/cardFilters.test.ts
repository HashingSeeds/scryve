import { cardOptions, filterGroups, matchesCardFilters } from "./cardFilters"
import { SCRYFALL_SOURCE } from "./cardSources"
import { MAGIC_CARD_FILTERS } from "../../../convex/lib/systems"

const card = (name: string, typeLine: string, legalFormats?: string[]) => ({
  scryfallId: name,
  oracleId: name,
  name,
  typeLine,
  ...(legalFormats ? { legalFormats } : {}),
})

test("subtypes come most common first and count only cards legal in the format", () => {
  const cards = [
    card("A", "Creature — Elf Druid", ["modern"]),
    card("B", "Creature — Elf Warrior", ["modern"]),
    card("C", "Creature — Elf", ["modern"]),
    card("D", "Creature — Goblin // Creature — Goblin Elf", ["modern"]),
    card("E", "Creature — Goblin", ["modern"]),
    card("F", "Creature — Goblin", ["legacy"]),
    card("G", "Creature — Goblin", ["legacy"]),
    card("H", "Creature — Goblin Rogue", ["legacy"]),
  ]
  expect(cardOptions(SCRYFALL_SOURCE, cards, "subtype", ["modern"])).toEqual([
    "Elf",
    "Goblin",
    "Druid",
    "Warrior",
  ])
  expect(cardOptions(SCRYFALL_SOURCE, cards, "subtype", [])).toEqual([
    "Goblin",
    "Elf",
    "Druid",
    "Rogue",
    "Warrior",
  ])
})

test("a card file without legal formats counts every card", () => {
  const cards = ["A", "B", "C"].map((name) => card(name, "Artifact — Equipment"))
  expect(cardOptions(SCRYFALL_SOURCE, cards, "subtype", ["modern"])).toEqual(["Equipment"])
})

test("cards without keywords add no blank keyword", () => {
  const cards = ["A", "B", "C"].map((name) => ({ ...card(name, "Sorcery"), keywords: "" }))
  expect(cardOptions(SCRYFALL_SOURCE, cards, "keyword", [])).toEqual([])
})

test("a grouped filter shares the heading of the filter its group names, even listed first", () => {
  const groups = filterGroups([
    { id: "supertype", label: "Supertype", group: "type", match: "all", options: ["Legendary"] },
    { id: "type", label: "Type", match: "any", options: ["Creature"] },
    { id: "manaValue", label: "Mana value", options: "range" },
  ])

  expect(
    groups.map(({ heading, filters }) => [heading.label, filters.map(({ id }) => id)]),
  ).toEqual([
    ["Type", ["supertype", "type"]],
    ["Mana value", ["manaValue"]],
  ])
})

test("a mana cost matches cards with at least that many of each plain symbol", () => {
  const matches = (manaCost: string) =>
    matchesCardFilters(SCRYFALL_SOURCE, { manaCost }, MAGIC_CARD_FILTERS, {
      manaCost: ["B", "R", "R", "R"],
    })
  expect(matches("{B}{B}{R}{R}{R}{G}{G}")).toBe(true)
  expect(matches("{4}{B}{R}{R}")).toBe(false)
  expect(matches("{B}{R/G}{R}{R}")).toBe(false)
})
