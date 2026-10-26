import { cardNameIndex, closestNamesFromCardTop, firstUnambiguousCardName } from "./cardNameMatch"

const index = cardNameIndex([
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
])

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

  it("prefers the card printed with exactly that name over a double-faced card sharing it", () => {
    expect(firstUnambiguousCardName(index, ["Sol Rlng"])?.name).toBe("Sol Ring")
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
