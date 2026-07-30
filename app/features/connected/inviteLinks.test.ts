import { buildInviteUrl, normalizeInvitePayload, normalizeManualCode } from "./inviteLinks"

describe("invite links", () => {
  const token = "A".repeat(43)

  it("accepts only the configured HTTPS origin or Count scheme", () => {
    expect(
      normalizeInvitePayload(`https://play.example/join/${token}`, "https://play.example"),
    ).toEqual({ kind: "token", token })
    expect(normalizeInvitePayload(`count://join/${token}`)).toEqual({ kind: "token", token })
    expect(
      normalizeInvitePayload(`https://foreign.example/join/${token}`, "https://play.example"),
    ).toBeNull()
    expect(
      normalizeInvitePayload(
        `https://play.example/join/${token}?token=copy`,
        "https://play.example",
      ),
    ).toBeNull()
  })

  it("normalizes safe manual codes and rejects ambiguous payloads", () => {
    expect(normalizeManualCode(" ab-12cd ")).toBe("AB12CD")
    expect(normalizeManualCode("AB12C")).toBeNull()
    expect(normalizeInvitePayload("AB12CD")).toEqual({ kind: "code", code: "AB12CD" })
  })

  it("builds an HTTPS invite without accepting malformed origins", () => {
    expect(buildInviteUrl("https://play.example", token)).toBe(`https://play.example/join/${token}`)
    expect(buildInviteUrl("http://play.example", token)).toBeNull()
  })
})
