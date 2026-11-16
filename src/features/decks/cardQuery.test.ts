import { formatCardQuery, parseCardQuery, querySpans, querySuggestions } from "./cardQuery"
import { SCRYFALL_SOURCE } from "./cardSources"
import { MAGIC_CARD_FILTERS } from "../../../convex/lib/systems"

const cardOptions: Record<string, readonly string[]> = {
  subtype: ["Lizard", "Elf", "Time Lord"],
  keyword: ["Flying", "First strike"],
}
const optionsFor = (id: string) => cardOptions[id] ?? []
const parse = (text: string) =>
  parseCardQuery(SCRYFALL_SOURCE, text, MAGIC_CARD_FILTERS, optionsFor)
const suggest = (text: string) =>
  querySuggestions(SCRYFALL_SOURCE, text, MAGIC_CARD_FILTERS, optionsFor).map(({ text }) => text)

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
      keyword: ["First strike"],
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
  const text = formatCardQuery(SCRYFALL_SOURCE, query, "exact", MAGIC_CARD_FILTERS)
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
    SCRYFALL_SOURCE,
    { ...typed, filters: { format: ["modern"] } },
    "exact",
    MAGIC_CARD_FILTERS,
  )
  expect(text).toBe("f:modern (t:elf or t:goblin)")
  expect(parse(text).filters).toEqual({ format: ["modern"], subtype: ["Elf", "goblin"] })
})

test.each([
  ["a subtype", "f:modern t:liz", ["f:modern t:lizard "]],
  [
    "a word inside an option, after those starting with it",
    "t:or",
    ["t:sorcery ", 't:"time lord" '],
  ],
  ["a quoted keyword", 'kw:"first st', ['kw:"first strike" ']],
  ["a format", "f:mod", ["f:modern "]],
])("finishes %s", (_name, text, expected) => {
  expect(suggest(text)).toEqual(expected)
})

test.each([
  ["a finished word", "t:lizard "],
  ["a number", "mv:"],
  ["a name", "bolt"],
  ["a closed quote", 'kw:"flying"'],
])("suggests nothing after %s", (_name, text) => {
  expect(suggest(text)).toEqual([])
})

test("colors each term by its sheet section, and keeps the text whole", () => {
  const text =
    'f:commander  id<=wur (t:creature or t:elf) mv>3 -kw:"first strike" o:draw bolt t:sol'
  const spans = querySpans(SCRYFALL_SOURCE, text, MAGIC_CARD_FILTERS, optionsFor, true)
  expect(spans.map((span) => span.text).join("")).toBe(text)
  const words = spans.filter((span) => !span.joiner && span.text.trim())
  expect(words.map(({ text, section }) => [text, section])).toEqual([
    ["f:commander", "format"],
    ["id<=wur", "colors"],
    ["t:creature", "type"],
    ["t:elf", "subtype"],
    ["mv>3", "manaValue"],
    ['-kw:"first strike"', "keyword"],
    ["o:draw", "syntax"],
    ["bolt", undefined],
    ["t:sol", undefined],
  ])
  expect(spans.filter((span) => span.joiner).map(({ text }) => text)).toEqual(["(", "or", ")"])
})
