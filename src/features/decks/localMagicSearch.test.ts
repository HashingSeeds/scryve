import { cardNameIndex } from "./cardNameMatch"
import { localMagicSearch, type MagicSearch, parseMagicCards } from "./localMagicSearch"

const card = (name: string, fields: Record<string, unknown> = {}) => ({
  scryfallId: name,
  oracleId: name,
  name,
  commanderEligibility: "ineligible",
  commanderLegality: "legal",
  colorIdentity: "",
  ...fields,
})
const commander = { commanderEligibility: "eligible" }

const magicCards = parseMagicCards(
  JSON.stringify({
    version: "1",
    cards: [
      card("Shivan Dragon", { colorIdentity: "R", keywords: "Flying" }),
      card("Dragonlord Atarka", { ...commander, colorIdentity: "GR", keywords: "Flying" }),
      card("Niv-Mizzet, the Firemind", { ...commander, colorIdentity: "UR", keywords: "Flying" }),
      card("Ancient Copper Dragon", { colorIdentity: "R", keywords: "Flying" }),
      card("Dragon's Hoard", { colorIdentity: "" }),
      card("Old Dragon", { ...commander, colorIdentity: "R", commanderLegality: "banned" }),
      card("Dragon Mirror", { commanderEligibility: "color-choice", colorIdentity: "" }),
      card("Bladewing the Risen", { ...commander, colorIdentity: "BR" }),
    ],
  }),
)
const search = (text: string, filters: Partial<MagicSearch> = {}) => {
  const found = localMagicSearch(magicCards, cardNameIndex(magicCards.cards.map((c) => c.name)), {
    text,
    commander: false,
    colors: [],
    colorMatch: "exact",
    filters: {},
    ...filters,
  })
  return found && { named: found.named.map((c) => c.name), found: found.found.map((c) => c.name) }
}

test("names holding every typed word come back A to Z, after the closest names", () => {
  expect(search("dragon")?.found).toEqual([
    "Ancient Copper Dragon",
    "Dragon Mirror",
    "Dragon's Hoard",
    "Dragonlord Atarka",
    "Old Dragon",
    "Shivan Dragon",
  ])
  expect(search("shivan dragn")?.named[0]).toBe("Shivan Dragon")
  expect(search("niv mizzet")?.found).toEqual(["Niv-Mizzet, the Firemind"])
})

test("a commander search keeps legal commanders, and a color-choice one may miss a color", () => {
  expect(search("dragon", { commander: true })?.found).toEqual([
    "Dragon Mirror",
    "Dragonlord Atarka",
  ])
  expect(search("", { commander: true, colors: ["R", "G"], colorMatch: "within" })?.found).toEqual([
    "Dragon Mirror",
    "Dragonlord Atarka",
  ])
  expect(search("", { commander: true, colors: ["U"], colorMatch: "additional" })?.found).toEqual([
    "Dragon Mirror",
    "Niv-Mizzet, the Firemind",
  ])
})

test.each([
  ["exact", ["Ancient Copper Dragon", "Old Dragon", "Shivan Dragon"]],
  ["additional", ["Ancient Copper Dragon", "Dragonlord Atarka", "Old Dragon", "Shivan Dragon"]],
  [
    "within",
    ["Ancient Copper Dragon", "Dragon Mirror", "Dragon's Hoard", "Old Dragon", "Shivan Dragon"],
  ],
] as const)("red with the %s color match", (colorMatch, expected) => {
  expect(search("dragon", { colors: ["R"], colorMatch })?.found).toEqual(expected)
})

test("colorless and keyword filters narrow the cards, and one letter beside a filter is dropped", () => {
  expect(search("d", { colors: ["C"] })?.found).toEqual(["Dragon Mirror", "Dragon's Hoard"])
  expect(search("dragon", { filters: { keyword: ["Flying"] } })?.found).toEqual([
    "Ancient Copper Dragon",
    "Dragonlord Atarka",
    "Shivan Dragon",
  ])
})

const typed = parseMagicCards(
  JSON.stringify({
    version: "2",
    cards: [
      card("Goblin Guide", {
        typeLine: "Creature — Goblin Scout",
        manaValue: 1,
        power: "2",
        toughness: "2",
        legalFormats: ["modern", "legacy"],
      }),
      card("Grave Titan", {
        typeLine: "Creature — Giant",
        manaValue: 6,
        power: "6",
        toughness: "6",
        legalFormats: ["modern"],
      }),
      card("Gisela, Blade of Goldnight", {
        typeLine: "Legendary Creature — Angel",
        manaValue: 7,
        power: "5",
        toughness: "5",
        legalFormats: ["commander"],
      }),
      card("Gitaxian Probe", { typeLine: "Sorcery", manaValue: 1, legalFormats: ["legacy"] }),
    ],
  }),
)
const searchTyped = (search: Partial<MagicSearch>) =>
  localMagicSearch(typed, undefined, {
    text: "",
    commander: false,
    colors: [],
    colorMatch: "exact",
    filters: {},
    ...search,
  })?.found.map((c) => c.name)

test.each<[string, Partial<MagicSearch>, string[]]>([
  [
    "creatures",
    { filters: { type: ["Creature"] } },
    ["Gisela, Blade of Goldnight", "Goblin Guide", "Grave Titan"],
  ],
  [
    "legendary creatures",
    { filters: { type: ["Legendary", "Creature"] } },
    ["Gisela, Blade of Goldnight"],
  ],
  ["a subtype", { filters: { type: ["Goblin"] } }, ["Goblin Guide"]],
  [
    "mana value 6 to 7",
    { filters: { manaValue: [">=6", "<=7"] } },
    ["Gisela, Blade of Goldnight", "Grave Titan"],
  ],
  ["power 6 or more skips cards without power", { filters: { power: [">=6"] } }, ["Grave Titan"]],
  [
    "toughness 5 or more",
    { filters: { toughness: [">=5"] } },
    ["Gisela, Blade of Goldnight", "Grave Titan"],
  ],
  [
    "legal in Legacy",
    { text: "g", filters: { format: ["legacy"] } },
    ["Gitaxian Probe", "Goblin Guide"],
  ],
])("filters the card file by %s", (_name, search, expected) => {
  expect(searchTyped(search)).toEqual(expected)
})

test("a card file without legal formats leaves a legality search to Scryfall", () => {
  expect(search("dragon", { filters: { format: ["modern"] } })).toBeUndefined()
})

test.each([
  ["Scryfall syntax", "t:dragon"],
  ["a quoted name", '"shivan dragon"'],
  ["an or query", "shivan or atarka"],
  ["a Japanese name", "シヴ山のドラゴン"],
])("leaves %s to Scryfall", (_name, text) => {
  expect(search(text)).toBeUndefined()
})

test("leaves every search to Scryfall until the card file loads", () => {
  expect(
    localMagicSearch(undefined, undefined, {
      text: "dragon",
      commander: false,
      colors: [],
      colorMatch: "exact",
      filters: {},
    }),
  ).toBeUndefined()
})

test("a malformed card file is refused", () => {
  expect(() => parseMagicCards(JSON.stringify({ version: "1", cards: [{ name: 1 }] }))).toThrow()
})

test("in a file without EDHREC ranks, the rarer card comes first among names that match equally", () => {
  const cards = parseMagicCards(
    JSON.stringify({
      version: "1",
      cards: [
        card("Rhystic Cave", { rarity: "uncommon" }),
        card("Rhystic Study", { rarity: "rare" }),
        card("Rhystic Tutor", { rarity: "common", commanderLegality: "banned" }),
      ],
    }),
  )
  const found = localMagicSearch(cards, cardNameIndex(cards.cards.map((c) => c.name)), {
    text: "rhystic",
    commander: false,
    colors: [],
    colorMatch: "exact",
    filters: {},
  })
  expect(found?.named.map((c) => c.name)).toEqual([
    "Rhystic Study",
    "Rhystic Cave",
    "Rhystic Tutor",
  ])
})

test("the most played card comes first among names that match equally, counting a Commander-banned card as most played", () => {
  const cards = parseMagicCards(
    JSON.stringify({
      version: "1",
      cards: [
        card("Oko, the Trickster", { rarity: "mythic", edhrecRank: 17791 }),
        card("Oko, Thief of Crowns", { rarity: "mythic", edhrecRank: 2104 }),
        card("Oko, the Ringleader", { rarity: "mythic", commanderLegality: "banned" }),
        card("Oko, Lorwyn Liege", { rarity: "mythic" }),
        card("Oko, the Ringmaster", { rarity: "uncommon", edhrecRank: 2103 }),
      ],
    }),
  )
  const found = localMagicSearch(cards, cardNameIndex(cards.cards.map((c) => c.name)), {
    text: "oko",
    commander: false,
    colors: [],
    colorMatch: "exact",
    filters: {},
  })
  expect(found?.named.map((c) => c.name)).toEqual([
    "Oko, the Ringleader",
    "Oko, the Ringmaster",
    "Oko, Thief of Crowns",
    "Oko, the Trickster",
    "Oko, Lorwyn Liege",
  ])
})
