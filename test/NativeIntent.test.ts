import { redirectSystemPath } from "../src/app/+native-intent"

describe("connected invite native intent", () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_INVITE_ORIGIN = "https://count.example"
  })
  it("routes only high-entropy invite paths", () => {
    const token = "a".repeat(43)
    expect(redirectSystemPath({ path: `https://count.example/join/${token}`, initial: true })).toBe(
      `/join/${token}`,
    )
    expect(redirectSystemPath({ path: `count://join/${token}`, initial: true })).toBe(
      `/join/${token}`,
    )
    expect(redirectSystemPath({ path: "https://evil.example/join/short", initial: true })).toBe("/")
    expect(redirectSystemPath({ path: `https://evil.example/join/${token}`, initial: true })).toBe(
      "/",
    )
    expect(
      redirectSystemPath({ path: `https://count.example/join/${token}?leak=1`, initial: true }),
    ).toBe("/")
  })
  it("fails closed for malformed initial URLs", () =>
    expect(redirectSystemPath({ path: "%%%", initial: true })).toBe("/"))

  it.each([
    `//evil.example/join/${"a".repeat(43)}`,
    "../settings",
    "/../settings",
    "/connected\\join",
    "/connected/%2Fjoin",
    "/connected/%5cjoin",
    "/connected/%2e%2e/join",
    "/settings?redirect=https://evil.example",
    "/settings#fragment",
    "/settings\u0000evil",
    "%%%",
    "https://evil.example/settings",
  ])("fails closed for untrusted warm intent %s", (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe("/")
  })

  it.each(["/", "/settings", "/connected/history", "/connected/game/game-public"])(
    "preserves safe absolute internal warm route %s",
    (path) => expect(redirectSystemPath({ path, initial: false })).toBe(path),
  )
})
