import { makeConvexTest } from "../test/convexTest"
import { api, internal } from "./_generated/api"

describe("provider health", () => {
  it("requires authentication to read current provider health", async () => {
    const t = makeConvexTest()

    await expect(
      t.query(api.providerHealth.current, {
        game: "pokemon",
        provider: "tcgdex",
        operation: "card-lookup",
      }),
    ).rejects.toMatchObject({ data: { code: "unauthenticated" } })
  })

  it("preserves the last success while replacing per-attempt fields", async () => {
    const t = makeConvexTest()
    const actor = t.withIdentity({ subject: "health-reader" })

    await t.mutation(internal.providerHealth.record, {
      game: "pokemon",
      provider: "tcgdex",
      operation: "card-lookup",
      status: "healthy",
      lastAttemptAt: 100,
      lastSuccessAt: 100,
      responseMs: 25,
      httpStatus: 200,
      message: "ok",
    })
    await t.mutation(internal.providerHealth.record, {
      game: "pokemon",
      provider: "tcgdex",
      operation: "card-lookup",
      status: "unavailable",
      lastAttemptAt: 200,
      message: "down",
    })

    await expect(
      actor.query(api.providerHealth.current, {
        game: "pokemon",
        provider: "tcgdex",
        operation: "card-lookup",
      }),
    ).resolves.toMatchObject({
      status: "unavailable",
      lastAttemptAt: 200,
      lastSuccessAt: 100,
      message: "down",
    })
    const current = await actor.query(api.providerHealth.current, {
      game: "pokemon",
      provider: "tcgdex",
      operation: "card-lookup",
    })
    expect(current).not.toHaveProperty("responseMs")
    expect(current).not.toHaveProperty("httpStatus")
  })
})
