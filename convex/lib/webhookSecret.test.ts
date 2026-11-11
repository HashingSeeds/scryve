import { secretMatches } from "./webhookSecret"

describe("secretMatches", () => {
  const expected = "Bearer hook-secret"

  it("accepts the configured secret", async () => {
    expect(await secretMatches("Bearer hook-secret", expected)).toBe(true)
  })

  it("rejects a wrong secret of the same length", async () => {
    expect(await secretMatches("Bearer hook-secreT", expected)).toBe(false)
  })

  it("rejects a missing, empty, shorter or longer secret", async () => {
    for (const given of [null, "", "Bearer hook-secre", "Bearer hook-secrets"])
      expect(await secretMatches(given, expected)).toBe(false)
  })
})
