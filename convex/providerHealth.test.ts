import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./providerHealth.ts": async () => jest.requireActual("./providerHealth"),
}

describe("provider health", () => {
  it("requires authentication to read current provider health", async () => {
    const t = convexTest(schema, modules)

    await expect(
      t.query(api.providerHealth.current, {
        game: "pokemon",
        provider: "tcgdex",
        operation: "card-lookup",
      }),
    ).rejects.toMatchObject({ data: { code: "unauthenticated" } })
  })

  it("preserves the last success while replacing per-attempt fields", async () => {
    const t = convexTest(schema, modules)
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
