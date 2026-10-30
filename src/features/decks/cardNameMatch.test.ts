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

  it("finds nothing for text unlike any name", () => {
    expect(searchCardNames(typed, "zzzz", 3)).toEqual([])
  })
})
