import { nearbyCodeFor, nearbyGameCode, nearbyGameHost, nearbyServiceName } from "./nearbyCode"

describe("nearby codes", () => {
  it("derives a stable invite-style code from the game id", () => {
    const code = nearbyCodeFor("lan_0123456789abcdef0123456789abcdef")
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(nearbyCodeFor("lan_0123456789abcdef0123456789abcdef")).toBe(code)
  })

  it("reads the code back from the advertised name, even after Bonjour renames it", () => {
    const name = nearbyServiceName("Sam Fox", "AB23CD")
    expect(nearbyGameCode(name)).toBe("AB23CD")
    expect(nearbyGameCode(`${name} (2)`)).toBe("AB23CD")
    expect(nearbyGameHost(`${name} (2)`)).toBe("Sam Fox")
  })

  it("finds no code in names from builds before codes", () => {
    expect(nearbyGameCode("Sam 3f9a")).toBeUndefined()
    expect(nearbyGameHost("Sam 3f9a")).toBe("Sam 3f9a")
  })
})
