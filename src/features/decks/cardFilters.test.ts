import { cardOptions, filterGroups, filterTerms, matchesCardFilters } from "./cardFilters"
import { SCRYFALL_SOURCE } from "./cardSources"
import { MAGIC_CARD_FILTERS } from "../../../convex/lib/systems"

const card = (name: string, typeLine: string, legalFormats?: string[]) => ({
  scryfallId: name,
  oracleId: name,
  name,
  typeLine,
  ...(legalFormats ? { legalFormats } : {}),
})

test("type words come most common first and count only cards legal in the format", () => {
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
  expect(cardOptions(SCRYFALL_SOURCE, cards, "type", ["modern"])).toEqual([
    "Creature",
    "Elf",
    "Goblin",
    "Druid",
    "Warrior",
  ])
  expect(cardOptions(SCRYFALL_SOURCE, cards, "type", [])).toEqual([
    "Creature",
    "Goblin",
    "Elf",
    "Druid",
    "Rogue",
    "Warrior",
  ])
})

test("a card file without legal formats counts every card", () => {
  const cards = ["A", "B", "C"].map((name) => card(name, "Artifact — Equipment"))
  expect(cardOptions(SCRYFALL_SOURCE, cards, "type", ["modern"])).toEqual(["Artifact", "Equipment"])
})

test("cards without keywords add no blank keyword", () => {
  const cards = ["A", "B", "C"].map((name) => ({ ...card(name, "Sorcery"), keywords: "" }))
  expect(cardOptions(SCRYFALL_SOURCE, cards, "keyword", [])).toEqual([])
})

test("filters sharing a group show under the group's heading", () => {
  expect(
    filterGroups(MAGIC_CARD_FILTERS).map(({ heading, filters }) => [
      heading.label,
      filters.map(({ id }) => id),
    ]),
  ).toEqual([
    ["Legal in", ["format"]],
    ["Type", ["type"]],
    ["Cost", ["manaValue", "manaCost"]],
    ["Power", ["power"]],
    ["Toughness", ["toughness"]],
    ["Keywords", ["keyword"]],
  ])
})

test("picked types all have to be on the card", () => {
  const picked = { type: ["Artifact", "Enchantment"] }
  const matches = (typeLine: string) =>
    matchesCardFilters(SCRYFALL_SOURCE, { typeLine }, MAGIC_CARD_FILTERS, picked)
  expect(matches("Enchantment Artifact — Equipment")).toBe(true)
  expect(matches("Artifact Creature — Golem")).toBe(false)
  expect(filterTerms(SCRYFALL_SOURCE, MAGIC_CARD_FILTERS, picked)).toEqual([
    "t:artifact",
    "t:enchantment",
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
  expect(matches("{1}{R}{R} // {B}{R}")).toBe(false)
  expect(matches("{1}{U} // {B}{R}{R}{R}")).toBe(true)
})
