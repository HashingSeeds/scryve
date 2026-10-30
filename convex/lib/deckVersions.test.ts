import { versionLabel } from "./deckVersions"

describe("versionLabel", () => {
  it.each(["Current", "Main", " Current "])(
    "reads a default-named version 1 (%j) as Current only while it is the latest",
    (name) => {
      expect(versionLabel({ versionNumber: 1, name }, 1)).toBe("Current")
      expect(versionLabel({ versionNumber: 1, name }, 2)).toBeUndefined()
    },
  )

  it("always shows a name the player typed", () => {
    expect(versionLabel({ versionNumber: 1, name: "Aggro" }, 3)).toBe("Aggro")
    expect(versionLabel({ versionNumber: 2, name: "Current" }, 3)).toBe("Current")
    expect(versionLabel({ versionNumber: 2, name: "Main" }, 2)).toBe("Main")
  })

  it("leaves an unnamed version to read by number", () => {
    expect(versionLabel({ versionNumber: 2 }, 2)).toBeUndefined()
    expect(versionLabel({ versionNumber: 2, name: "  " }, 2)).toBeUndefined()
  })
})
