import { cardNameIndex } from "./cardNameMatch"
import { localMagicSearch, type MagicSearch, parseMagicCards } from "./localMagicSearch"

const card = (name: string, fields: Record<string, string> = {}) => ({
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
    keywords: [],
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
  expect(search("dragon", { keywords: ["Flying"] })?.found).toEqual([
    "Ancient Copper Dragon",
    "Dragonlord Atarka",
    "Shivan Dragon",
  ])
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
      keywords: [],
    }),
  ).toBeUndefined()
})

test("a malformed card file is refused", () => {
  expect(() => parseMagicCards(JSON.stringify({ version: "1", cards: [{ name: 1 }] }))).toThrow()
})
