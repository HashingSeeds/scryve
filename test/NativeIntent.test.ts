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
    expect(redirectSystemPath({ path: "count://join/AB12CD", initial: true })).toBe(
      "/connected/join?code=AB12CD",
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

  it.each(["/", "/settings", "/history", "/connected/game/game-public"])(
    "preserves safe absolute internal warm route %s",
    (path) => expect(redirectSystemPath({ path, initial: false })).toBe(path),
  )

  it.each([
    ["scryve-dev://dev/seed/game?format=commander&cmd=2%3E3:9", true],
    ["count-dev://dev/seed/game?players=6", false],
    ["scryve-dev:///dev/seed/game?players=6", true],
    ["/dev/seed/game?players=6", false],
  ])("keeps dev seed link %s with its query", (path, initial) => {
    expect(redirectSystemPath({ path, initial })).toBe(
      `/dev/seed/game${path.slice(path.indexOf("?"))}`,
    )
  })

  it.each([
    "scryve-dev://dev/settings?x=1",
    "scryve-dev://dev/seed/game/extra?x=1",
    "//dev/seed/game?players=6",
    "/settings/../dev/seed/game?players=6",
    "https://evil.example/dev/seed/game?players=6",
    "evil://dev/seed/game?players=6",
    "/dev/seed/game?players=6#x",
    "/dev/seed/game?players=6\tx",
  ])("drops non-seed dev link %s", (path) =>
    expect(redirectSystemPath({ path, initial: true })).toBe("/"),
  )

  it("drops seed links outside development builds", () => {
    const development = __DEV__
    Reflect.set(globalThis, "__DEV__", false)
    try {
      expect(redirectSystemPath({ path: "scryve-dev://dev/seed/game", initial: false })).toBe("/")
    } finally {
      Reflect.set(globalThis, "__DEV__", development)
    }
  })

  it.each([
    "scryve-preview://preview/pr-123",
    "count-preview://preview/pr-123",
    "scryve-preview://expo-development-client/?url=https://u.expo.dev/1e4ab9fb-230c-421d-a659-a4aaa4355d82?channel-name=pr-123",
    "/preview/pr-123",
  ])("routes PR preview link %s", (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe("/preview/pr-123")
  })

  it.each([
    "scryve-preview://preview/production",
    "scryve-preview://preview/pr-123?x=1",
    "scryve-preview://preview/pr-",
    "scryve://preview/pr-123",
    "scryve-preview://expo-development-client/?url=https://evil.example/x?channel-name=pr-123",
    "scryve-preview://expo-development-client/?url=https://u.expo.dev/1e4ab9fb-230c-421d-a659-a4aaa4355d82?channel-name=beta",
  ])("drops other preview link %s", (path) =>
    expect(redirectSystemPath({ path, initial: true })).toBe("/"),
  )
})
