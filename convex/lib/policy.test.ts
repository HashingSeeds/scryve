import {
  assertAllowedColor,
  assertAvatarUrl,
  assertDisplayName,
  assertInviteToken,
  assertPlayerCount,
  assertStartingLife,
  inviteIsUsable,
  normalizeManualCode,
} from "./policy"

describe("connected lobby server policy", () => {
  it.each([2, 3, 4, 5, 6])("accepts %i players", (count) =>
    expect(() => assertPlayerCount(count)).not.toThrow(),
  )
  it.each([0, 1, 7, 2.5])("rejects invalid player count %s", (count) =>
    expect(() => assertPlayerCount(count)).toThrow("2–6"),
  )
  it("validates life, names, colors, and 256-bit URL-safe tokens", () => {
    expect(() => assertStartingLife(0)).toThrow()
    expect(() => assertStartingLife(20)).not.toThrow()
    expect(assertDisplayName(" Ada ")).toBe("Ada")
    expect(() => assertDisplayName(" ")).toThrow()
    expect(() => assertAllowedColor("red")).toThrow()
    expect(() => assertAllowedColor("#12Ab90")).not.toThrow()
    expect(() => assertInviteToken("guessable")).toThrow()
    expect(() => assertInviteToken("a".repeat(43))).not.toThrow()
  })
  it("normalizes codes and treats expiration/revocation independently", () => {
    expect(normalizeManualCode("ab-12 cd")).toBe("AB12CD")
    expect(inviteIsUsable({ expiresAt: 101 }, 100)).toBe(true)
    expect(inviteIsUsable({ expiresAt: 100 }, 100)).toBe(false)
    expect(inviteIsUsable({ expiresAt: 101, revokedAt: 99 }, 100)).toBe(false)
  })
  it("accepts only bounded credential-free HTTPS avatar URLs", () => {
    expect(assertAvatarUrl(undefined)).toBeUndefined()
    expect(assertAvatarUrl("https://images.example.test/avatar.png")).toBe(
      "https://images.example.test/avatar.png",
    )
    expect(() => assertAvatarUrl("http://images.example.test/avatar.png")).toThrow("HTTPS")
    expect(() => assertAvatarUrl("https://user:pass@example.test/avatar.png")).toThrow(
      "without credentials",
    )
    expect(() => assertAvatarUrl(`https://example.test/${"a".repeat(600)}`)).toThrow("at most")
    expect(() => assertAvatarUrl(`https://example.test/${"é".repeat(100)}`)).toThrow(
      "after normalization",
    )
  })
})
