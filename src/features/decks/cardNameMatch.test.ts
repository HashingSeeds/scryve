import {
  cardNameIndex,
  closestNamesFromCardTop,
  firstUnambiguousCardName,
  searchCardNames,
} from "./cardNameMatch"

const index = cardNameIndex(
  [
    "Kitt Kanto, Mayhem Diva",
    "Sol Ring",
    "Sol Ring // Sol Ring",
    "Ensoul Ring",
    "Counterspell",
    "Wizards of Thay",
    "Delver of Secrets // Insectile Aberration",
    "Ajani's Pridemate",
    "Ajani's Presence",
    "Æther Vial",
    "Acidic Slime",
  ],
  [["Marauding Mutagen", "Acidic Slime"]],
)

describe("firstUnambiguousCardName", () => {
  it.each([
    ["Kitr Kanto, Mayhem Diva", "Kitt Kanto, Mayhem Diva"],
    ["Sol Rlng", "Sol Ring"],
    ["Ccunterspell", "Counterspell"],
    ["Insectile Aberration", "Delver of Secrets // Insectile Aberration"],
    ["Aether Vial", "Æther Vial"],
  ])("reads %s as %s", (line, name) => {
    expect(firstUnambiguousCardName(index, [line])?.name).toBe(name)
  })

  it("skips lines that are not a card name, like the copyright line", () => {
    expect(
      firstUnambiguousCardName(index, [
        "IM &O Wizards of the Coast",
        "Legendaty Creatfure - Cat Bard Druid",
      ]),
    ).toBeUndefined()
    expect(firstUnambiguousCardName(index, ["IM &O Wizards of the Coast", "Sol Ring"])?.name).toBe(
      "Sol Ring",
    )
  })

  it("reads a card printed under another name as its real card", () => {
    expect(firstUnambiguousCardName(index, ["Maraudlng Mutagen"])).toMatchObject({
      name: "Acidic Slime",
      printedName: "Marauding Mutagen",
    })
  })

  it("refuses to choose between two names a misread fits equally", () => {
    expect(firstUnambiguousCardName(index, ["Ajani's Pre ate"])).toBeUndefined()
  })
})

describe("closestNamesFromCardTop", () => {
  it("offers the nearest real names for the card's top lines, best first", () => {
    expect(closestNamesFromCardTop(index, ["Sol Rlng", "Artifact"], 2)).toEqual([
      "Sol Ring",
      "Sol Ring // Sol Ring",
    ])
  })
})

describe("searchCardNames", () => {
  const typed = cardNameIndex(
    ["Light", "Lightning Axe", "Lightning Bolt", "Sol Ring", "Solemn Simulacrum", "Acidic Slime"],
    [["Marauding Mutagen", "Acidic Slime"]],
  )

  it.each([
    ["the start of a name", "sol r", "Sol Ring"],
    ["a misspelled name", "lightnig bolt", "Lightning Bolt"],
    ["a later word in the name", "bolt", "Lightning Bolt"],
    ["a name printed on another card", "marauding mut", "Acidic Slime"],
  ])("finds %s first", (_case, query, name) => {
    expect(searchCardNames(typed, query, 3)[0]).toBe(name)
  })

  it("ranks a whole-name match above longer names it starts", () => {
    expect(searchCardNames(typed, "light", 3)).toEqual(["Light", "Lightning Axe", "Lightning Bolt"])
  })

  it.each([
    ["a whole word over a longer word it starts", "swords", "Swords to Plowshares"],
    ["a legend over a card named for it", "sheoldred", "Sheoldred, the Apocalypse"],
    ["a name typed with its words out of order", "plowshares swords", "Swords to Plowshares"],
    ["every typed word over a closer start", "lightning arc", "Arc Lightning"],
  ])("ranks %s", (_case, query, name) => {
    const words = cardNameIndex([
      "Swordsman's Steel",
      "Sheoldred's Edict",
      "Lightning, Army of One",
      name,
    ])
    expect(searchCardNames(words, query, 3)[0]).toBe(name)
  })

  it.each([
    ["an exact name over a preferred longer one", ["Fog", "Fog Bank"], "fog", "Fog"],
    [
      "a whole name over a preferred card with it on one face",
      ["Emeritus of Truce // Swords to Plowshares", "Swords to Plowshares"],
      "swords to plowshares",
      "Swords to Plowshares",
    ],
  ])("ranks %s", (_case, names, query, name) => {
    const prefer = (candidate: string) => (candidate === name ? 0 : 1)
    expect(searchCardNames(cardNameIndex(names), query, 3, prefer)[0]).toBe(name)
  })

  it("finds nothing for text unlike any name", () => {
    expect(searchCardNames(typed, "zzzz", 3)).toEqual([])
  })
})
