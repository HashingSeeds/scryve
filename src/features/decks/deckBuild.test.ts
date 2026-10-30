import { buildSections, countCardChanges, typeGroup } from "./deckBuild"

const sections = [
  { id: "commander", label: "Commander" },
  { id: "main", label: "Main deck" },
  { id: "sideboard", label: "Sideboard" },
]

it.each([
  ["Basic Land — Forest", "lands"],
  ["Artifact Creature — Golem", "creatures"],
  ["Legendary Artifact", "artifacts"],
  ["Instant", "spells"],
  ["Sorcery // Land", "spells"],
  [undefined, "other"],
] as const)("puts %s in %s", (typeLine, group) => {
  expect(typeGroup(typeLine)).toBe(group)
})

it("splits the main deck by type and keeps other sections whole", () => {
  const types: Record<string, string> = {
    Atraxa: "Legendary Creature — Phyrexian Angel",
    Elves: "Creature — Elf Druid",
    Forest: "Basic Land — Forest",
    Ring: "Artifact",
    Mystery: "",
  }
  const cards = [
    { name: "Forest", quantity: 30 },
    { name: "Elves", quantity: 1 },
    { name: "Ring", quantity: 1 },
    { name: "Atraxa", quantity: 1, section: "commander" },
    { name: "Unknown", quantity: 2 },
    { name: "Elves", quantity: 1, section: "sideboard" },
  ]

  const grouped = buildSections(cards, sections, (card) => types[card.name])

  expect(grouped.map(({ label, quantity }) => [label, quantity])).toEqual([
    ["Commander", 1],
    ["Creatures", 1],
    ["Artifacts", 1],
    ["Lands", 30],
    ["Other", 2],
    ["Sideboard", 1],
  ])
})

it("keeps section groups when card types are unknown", () => {
  const grouped = buildSections([{ name: "Pikachu", quantity: 4 }], sections)

  expect(grouped.map((section) => section.label)).toEqual(["Main deck"])
})

it("counts each changed printing once", () => {
  const base = [
    { name: "Forest", quantity: 30 },
    { name: "Elves", quantity: 1 },
    { name: "Ring", quantity: 1 },
    { name: "Atraxa", quantity: 1, section: "commander" },
  ]
  const cards = [
    { name: "Forest", quantity: 28 },
    { name: "Elves", quantity: 1 },
    { name: "Atraxa", quantity: 1, section: "commander", commanderColor: "G" as const },
    { name: "Bolt", quantity: 1 },
  ]

  expect(countCardChanges(base, cards)).toBe(4)
  expect(countCardChanges(base, base)).toBe(0)
})

it("counts a card moved between main and sideboard as one change", () => {
  const base = [{ name: "Bolt", quantity: 4 }]
  const cards = [
    { name: "Bolt", quantity: 3 },
    { name: "Bolt", quantity: 1, section: "sideboard" },
  ]

  expect(countCardChanges(base, cards)).toBe(1)
})
