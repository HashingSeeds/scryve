import {
  describeUsernameMatches,
  usernameFailsGate,
  usernameFailsReportThreshold,
} from "./nameFilter"

describe("username filter", () => {
  it("allows ordinary handles", () => {
    for (const username of ["matt-c", "clever-otter-01", "classic_player", "grass-master"]) {
      expect(usernameFailsGate(username)).toBe(false)
      expect(usernameFailsReportThreshold(username)).toBe(false)
    }
  })

  it("rejects profanity, including leetspeak and separator padding", () => {
    for (const username of ["sh1t-lord", "b-i-t-c-h", "f4ggot", "fuuuuck-you"]) {
      expect(usernameFailsGate(username)).toBe(true)
    }
  })

  it("keeps the whitelist on the report threshold so a malicious report cannot hold an innocent name", () => {
    expect(usernameFailsGate("assassin-42")).toBe(false)
    expect(usernameFailsReportThreshold("assassin-42")).toBe(false)
  })

  it("reports the matched dataset words for the operator queue", () => {
    expect(describeUsernameMatches("sh1t-lord")).toContain("shit")
    expect(describeUsernameMatches("clever-otter-01")).toEqual([])
  })
})
