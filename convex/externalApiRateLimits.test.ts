import { makeConvexTest, type ConvexTestHarness } from "../test/convexTest"
import { internal } from "./_generated/api"

describe("Scryfall request pacing", () => {
  let t: ConvexTestHarness
  let now: jest.SpiedFunction<typeof Date.now>
  const acquire = (path: string) =>
    t.mutation(internal.externalApiRateLimits.acquireScryfall, { path })

  beforeEach(() => {
    now = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    t = makeConvexTest()
  })
  afterEach(() => jest.restoreAllMocks())

  it("gives concurrent requests distinct slots instead of asking them to retry", async () => {
    expect(await acquire("/cards/example")).toEqual({ waitMs: 0, blocked: false })
    expect(await acquire("/cards/example")).toEqual({ waitMs: 125, blocked: false })
    expect(await acquire("/cards/search?q=first")).toEqual({ waitMs: 250, blocked: false })
    expect(await acquire("/cards/search?q=second")).toEqual({ waitMs: 875, blocked: false })
  })

  it("keeps endpoint spacing while the shared queue is busy", async () => {
    expect(await acquire("/cards/search?q=first")).toEqual({ waitMs: 0, blocked: false })
    for (let request = 1; request <= 7; request += 1)
      expect(await acquire(`/cards/example-${request}`)).toEqual({
        waitMs: request * 125,
        blocked: false,
      })
    expect(await acquire("/cards/search?q=second")).toEqual({ waitMs: 1000, blocked: false })
    expect(await acquire("/cards/search?q=third")).toEqual({ waitMs: 1625, blocked: false })
  })

  it("spaces requests a full slot apart when the clock is between slots", async () => {
    now.mockReturnValue(1_000_124)
    expect(await acquire("/cards/example")).toEqual({ waitMs: 1, blocked: false })
    expect(await acquire("/cards/search?q=first")).toEqual({ waitMs: 126, blocked: false })
  })

  it("refuses slots past the wait limit without reserving them", async () => {
    expect(await acquire("/cards/manifest")).toEqual({ waitMs: 0, blocked: false })
    expect(await acquire("/cards/manifest")).toEqual({ waitMs: 6125, blocked: false })
    expect(await acquire("/cards/manifest")).toEqual({ waitMs: 12_250, blocked: true })
    expect(await acquire("/cards/example")).toEqual({ waitMs: 125, blocked: false })
  })

  it("stops new and queued requests during a 429 cooldown", async () => {
    await t.mutation(internal.externalApiRateLimits.block, {
      bucket: "scryfall:cooldown",
      durationMs: 30_000,
    })
    now.mockReturnValue(1_000_500)
    expect(await acquire("/cards/example")).toEqual({ waitMs: 29_500, blocked: true })
    await expect(t.query(internal.externalApiRateLimits.scryfallCooldownUntil, {})).resolves.toBe(
      1_030_000,
    )
    now.mockReturnValue(1_030_000)
    expect(await acquire("/cards/example")).toEqual({ waitMs: 0, blocked: false })
  })

  it.each([
    ["/cards/named?exact=Forest", 625],
    ["/cards/random", 625],
    ["/cards/manifest", 6125],
  ])("paces %s without a burst allowance", async (path, interval) => {
    expect(await acquire(path)).toEqual({ waitMs: 0, blocked: false })
    expect(await acquire(path)).toEqual({ waitMs: interval, blocked: false })
  })

  it("allocates a unique persistent slot to every concurrent reservation", async () => {
    const reservations = await Promise.all(
      Array.from({ length: 20 }, () =>
        t.mutation(internal.externalApiRateLimits.reserve, {
          bucket: "stress-test",
          intervalMs: 500,
        }),
      ),
    )

    expect(reservations.sort((left, right) => left - right)).toEqual(
      Array.from({ length: 20 }, (_, index) => index * 500),
    )
  })

  it("preserves the full cooldown after an external 429", async () => {
    await t.mutation(internal.externalApiRateLimits.block, {
      bucket: "scryfall:cards-search",
      durationMs: 30_000,
    })

    await expect(
      t.mutation(internal.externalApiRateLimits.reserve, {
        bucket: "scryfall:cards-search",
        intervalMs: 500,
      }),
    ).resolves.toBe(30_000)
  })
})
