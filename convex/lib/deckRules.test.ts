import { deckIssues, type CardFacets, type RuleCard } from "./deckRules"

type Card = RuleCard & { facets?: CardFacets }

const facets = (domains: string, extra: Record<string, string> = {}): CardFacets => [
  { key: "domains", value: domains },
  ...Object.entries(extra).map(([key, value]) => ({ key, value })),
]

const card = (section: string, name: string, quantity: number, cardFacets?: CardFacets): Card => ({
  section,
  name,
  quantity,
  facets: cardFacets,
})

const legend = card("legend", "Jinx, Loose Cannon", 1, facets("Fury, Chaos", { tags: "Jinx" }))
const champion = card(
  "champion",
  "Jinx, Rebel",
  1,
  facets("Chaos", { supertype: "Champion", tags: "Jinx, Zaun" }),
)

const validDeck: Card[] = [
  legend,
  champion,
  ...Array.from({ length: 13 }, (_, index) =>
    card("main", `Unit ${index}`, 3, facets(index % 2 ? "Fury" : "Chaos")),
  ),
  card("battlefields", "Altar to Unity", 1, facets("Colorless")),
  card("battlefields", "Grove of the God-Willow", 1, facets("")),
  card("battlefields", "Hallowed Tomb", 1, facets("Colorless")),
  card("runes", "Fury Rune", 6, facets("Fury")),
  card("runes", "Chaos Rune", 6, facets("Chaos")),
  card("sideboard", "Pouty Poro", 2, facets("Fury")),
]

const issues = (cards: Card[]) => deckIssues("riftbound", "constructed", cards, (c) => c.facets)

function replace(cards: Card[], name: string, next: Card[]) {
  return cards.flatMap((entry) => (entry.name === name ? next : [entry]))
}

it("passes a legal Riftbound Constructed deck", () => {
  expect(issues(validDeck)).toEqual([])
})

it("gives each format its own rules", () => {
  expect(deckIssues("riftbound", "constructed", [], () => undefined)).not.toEqual([])
  expect(deckIssues("mtg", "standard", [], () => undefined)).toEqual([])
})

it("counts section sizes across the sections each rule names", () => {
  const deck = [
    ...replace(validDeck, "Unit 0", [card("main", "Unit 0", 1, facets("Chaos"))]),
    card("legend", "Ahri, Nine-Tailed Fox", 1, facets("Calm, Mind", { tags: "Ahri" })),
    ...["A", "B", "C"].map((spare) => card("sideboard", `Spare ${spare}`, 3, facets("Fury"))),
  ]
  expect(issues(deck)).toEqual([
    { code: "size", sections: ["legend"], count: 2, target: 1, exact: true },
    { code: "size", sections: ["champion", "main"], count: 38, target: 40, exact: true },
    { code: "size", sections: ["sideboard"], count: 11, target: 10, exact: false },
  ])
})

it("limits copies by name across Chosen Champion, main deck, and sideboard", () => {
  const deck = replace(validDeck, "Pouty Poro", [card("sideboard", " unit  1", 1, facets("Fury"))])
  expect(issues(deck)).toEqual([{ code: "copies", name: "Unit 1", count: 4, max: 3 }])
})

it("needs three different Battlefields", () => {
  const deck = replace(validDeck, "Hallowed Tomb", [
    card("battlefields", "Altar to Unity", 1, facets("Colorless")),
  ])
  expect(issues(deck)).toEqual([
    { code: "unique", section: "battlefields", name: "Altar to Unity", count: 2 },
  ])
})

it("keeps cards inside the Legend's domains and champion", () => {
  const signature = (name: string, tags: string) =>
    card("main", name, 1, facets("Fury", { supertype: "Signature", tags }))
  const deck = [
    ...replace(validDeck, "Jinx, Rebel", [
      card(
        "champion",
        "Darius, Trifarian",
        1,
        facets("Fury", { supertype: "Champion", tags: "Trifarian, Darius, Noxus" }),
      ),
    ]),
    card("main", "Svellsongur", 1, facets("Calm")),
    card("runes", "Calm Rune", 1, facets("Calm")),
    signature("Get Excited!", "Jinx"),
    signature("Super Mega Death Rocket!", "Jinx"),
    signature("Fishbones", "Jinx"),
    signature("Decimate", "Darius"),
  ]
  expect(issues(deck).filter((issue) => issue.code !== "size" && issue.code !== "copies")).toEqual([
    { code: "signatureCount", count: 4, max: 3 },
    { code: "champion", name: "Darius, Trifarian", champion: ["Jinx"] },
    { code: "domain", name: "Svellsongur", domains: ["Calm"], identity: ["Fury", "Chaos"] },
    { code: "domain", name: "Calm Rune", domains: ["Calm"], identity: ["Fury", "Chaos"] },
    { code: "signatureChampion", name: "Decimate", champion: ["Jinx"] },
  ])
})

it("skips identity checks for cards whose facets have not loaded", () => {
  const offDomain = card("main", "Svellsongur", 1, facets("Calm"))
  const unloaded = card("main", "Svellsongur", 1)
  const noLegend = replace([...validDeck, offDomain], legend.name, [])
  expect(
    issues(noLegend).filter((issue) => issue.code !== "size" && issue.code !== "copies"),
  ).toEqual([])
  expect(issues([...validDeck, unloaded]).filter((issue) => issue.code !== "size")).toEqual([])
})

const mtg = (fields: Record<string, string>): CardFacets =>
  Object.entries(fields).map(([key, value]) => ({ key, value }))
const mtgIssues = (format: string, cards: Card[]) =>
  deckIssues("mtg", format, cards, (c) => c.facets)

describe("Magic", () => {
  const rats = card(
    "main",
    "Relentless Rats",
    20,
    mtg({ oracleText: "A deck can have any number of cards named Relentless Rats." }),
  )
  const dwarves = card(
    "main",
    "Seven Dwarves",
    7,
    mtg({ oracleText: "A deck can have up to seven cards named Seven Dwarves." }),
  )

  it("Modern needs 60 cards, at most 15 in the sideboard, and 4 copies outside basic lands", () => {
    const deck = [
      card("main", "Lightning Bolt", 5, mtg({ typeLine: "Instant" })),
      card("main", "Snow-Covered Mountain", 20),
      card("main", "Mountain", 18),
      rats,
      dwarves,
      card("sideboard", "Lightning Bolt", 1),
      card("sideboard", "Smash to Smithereens", 16, mtg({ typeLine: "Instant" })),
    ]
    expect(mtgIssues("modern", deck)).toEqual([
      { code: "size", sections: ["sideboard"], count: 17, target: 15, exact: false },
      { code: "copies", name: "Lightning Bolt", count: 6, max: 4 },
      { code: "copies", name: "Smash to Smithereens", count: 16, max: 4 },
    ])
    expect(mtgIssues("modern", [card("main", "Mountain", 59)])).toEqual([
      { code: "size", sections: ["main"], count: 59, target: 60, exact: false },
    ])
  })

  it("waits for card text before counting copies, since it can raise the limit", () => {
    const unloaded = card("main", "Relentless Rats", 20)
    expect(mtgIssues("modern", [unloaded, card("main", "Mountain", 40)])).toEqual([])
  })

  it("Commander needs 100 singleton cards inside the commanders' colors and legal in Commander", () => {
    const deck = [
      card("commander", "Thrasios, Triton Hero", 1, mtg({ colorIdentity: "GU" })),
      card("commander", "Tymna the Weaver", 1, mtg({ colorIdentity: "WB" })),
      card("main", "Sol Ring", 2, mtg({ "colorIdentity": "", "legality:commander": "legal" })),
      card("main", "Mana Crypt", 1, mtg({ "colorIdentity": "", "legality:commander": "banned" })),
      card("main", "Lightning Bolt", 1, mtg({ colorIdentity: "R" })),
      card("main", "Unloaded Card", 1),
      card("main", "Forest", 93),
    ]
    expect(mtgIssues("commander", deck)).toEqual([
      { code: "copies", name: "Sol Ring", count: 2, max: 1 },
      { code: "legality", name: "Mana Crypt", format: "commander", status: "banned" },
      { code: "colorIdentity", name: "Lightning Bolt", colors: "R", identity: "GUWB" },
    ])
  })

  it("Commander counts the commander toward 100 and needs one or two of them", () => {
    expect(mtgIssues("commander", [card("main", "Forest", 100)])).toEqual([
      { code: "size", sections: ["commander"], count: 0, target: 1, exact: false },
    ])
  })
})
