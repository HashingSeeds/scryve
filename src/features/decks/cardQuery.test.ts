import { formatCardQuery, parseCardQuery } from "./cardQuery"
import { MAGIC_CARD_FILTERS } from "../../../convex/lib/systems"

const subtypes = ["Lizard", "Elf", "Time Lord"]
const parse = (text: string) =>
  parseCardQuery(text, MAGIC_CARD_FILTERS, (id) => (id === "subtype" ? subtypes : []))

test("reads the terms the sheet writes, in any case, and keeps the name", () => {
  expect(
    parse(
      'F:Modern t:LEGENDARY (t:creature or t:artifact) t:lizard mv>=2 cmc<=4 pow=3 kw:"first strike" id<=ur bolt',
    ),
  ).toEqual({
    rest: "bolt",
    filters: {
      format: ["modern"],
      supertype: ["Legendary"],
      type: ["Creature", "Artifact"],
      subtype: ["Lizard"],
      manaValue: [">=2", "<=4"],
      power: [">=3", "<=3"],
      keyword: ["first strike"],
    },
    colors: ["U", "R"],
    colorMatch: "within",
  })
})

test("writes filters before the name, and reads its own text back", () => {
  const query = {
    rest: "bolt",
    filters: { type: ["Creature", "Artifact"], subtype: ["Time Lord"], manaValue: ["<=2"] },
    colors: ["U", "R"],
  }
  const text = formatCardQuery(query, "exact", MAGIC_CARD_FILTERS)
  expect(text).toBe('(t:creature or t:artifact) t:"time lord" mv<=2 id=ur bolt')
  expect(parse(text)).toEqual({ ...query, colorMatch: "exact" })
})

test.each([
  [
    "a second subtype, which Scryfall reads as both",
    "t:elf t:lizard",
    { subtype: ["Elf"] },
    "t:lizard",
  ],
  ["a negated term", "-t:creature bolt", {}, "-t:creature bolt"],
  ["a key the sheet has no control for", "o:flying", {}, "o:flying"],
  ["a mana value bound given twice", "mv>=2 mv>=3", { manaValue: [">=2"] }, "mv>=3"],
  ["a guild name", "id:azorius", {}, "id:azorius"],
  ["a regular expression", "t:/dragon/", {}, "t:/dragon/"],
])("leaves %s as typed", (_name, text, filters, rest) => {
  expect(parse(text)).toMatchObject({ filters, rest })
})

test("leaves everything as typed when a top-level or joins it, and groups it under new filters", () => {
  const typed = parse("t:elf or t:goblin")
  expect(typed).toEqual({ rest: "t:elf or t:goblin", filters: {}, colors: [] })
  const text = formatCardQuery(
    { ...typed, filters: { format: ["modern"] } },
    "exact",
    MAGIC_CARD_FILTERS,
  )
  expect(text).toBe("f:modern (t:elf or t:goblin)")
  expect(parse(text).filters).toEqual({ format: ["modern"], subtype: ["Elf", "goblin"] })
})
