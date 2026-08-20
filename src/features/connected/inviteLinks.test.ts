import {
  buildInviteQrPayload,
  buildInviteUrl,
  normalizeInvitePayload,
  normalizeManualCode,
} from "./inviteLinks"

describe("invite links", () => {
  const token = "A".repeat(43)

  it("accepts only the configured HTTPS origin or trusted Scryve schemes", () => {
    expect(
      normalizeInvitePayload(`https://play.example/join/${token}`, "https://play.example"),
    ).toEqual({ kind: "token", token })
    expect(normalizeInvitePayload(`count://join/${token}`)).toEqual({ kind: "token", token })
    expect(normalizeInvitePayload(`scryve://join/${token}`)).toEqual({ kind: "token", token })
    expect(normalizeInvitePayload("count://join/AB12CD")).toEqual({
      kind: "code",
      code: "AB12CD",
    })
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

  it("prefers a compact manual-code QR payload that round-trips through invite parsing", () => {
    const payload = buildInviteQrPayload(token, "ab-12cd")
    expect(payload).toBe("scryve://join/AB12CD")
    expect(normalizeInvitePayload(payload!)).toEqual({ kind: "code", code: "AB12CD" })
    expect(buildInviteQrPayload(token)).toBe(`scryve://join/${token}`)
    expect(buildInviteQrPayload("invalid")).toBeNull()
  })
})
