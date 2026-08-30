import { convexTest } from "convex-test"

import { internal } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./cardCatalog.ts": async () => jest.requireActual("./cardCatalog"),
}

function printing(index: number) {
  return {
    provider: "fixture",
    providerCardId: `provider-${index}`,
    printingId: `printing-${index}`,
    setCode: `SET-${index}`,
    faces: [{ index: 0, text: `Printing ${index}` }],
  }
}

function card(printings: ReturnType<typeof printing>[]) {
  return {
    game: "pokemon" as const,
    identityNamespace: "fixture-card",
    cardId: "logical-card",
    name: "Many Printings",
    nameNormalized: "many printings",
    facets: [],
    printings,
  }
}

describe("normalized card catalog", () => {
  it("projects the printing used for a printing-id lookup", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.cardCatalog.cacheMany, {
      cards: [card([printing(1), printing(2)])],
    })

    await expect(
      t.query(internal.cardCatalog.lookupCached, {
        game: "pokemon",
        cardId: "printing-2",
      }),
    ).resolves.toMatchObject({
      cardId: "logical-card",
      printingId: "printing-2",
      providerCardId: "provider-2",
      setCode: "SET-2",
      text: "Printing 2",
    })
  })

  it("accepts cards above the cache batch size and caps stored printings", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.cardCatalog.cacheMany, {
      cards: [card(Array.from({ length: 101 }, (_, index) => printing(index)))],
    })

    await expect(
      t.run(async (ctx) => await ctx.db.query("cardPrintings").collect()),
    ).resolves.toHaveLength(100)
  })

  it("rejects cards without a printing", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(internal.cardCatalog.cacheMany, { cards: [card([])] }),
    ).rejects.toMatchObject({ data: { code: "invalid_card" } })
  })
})
