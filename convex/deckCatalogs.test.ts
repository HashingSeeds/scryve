import { v } from "convex/values"
import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./deckCatalogs.ts": async () => jest.requireActual("./deckCatalogs"),
  "./externalApiRateLimits.ts": async () => ({
    reserve: internalMutation({
      args: { bucket: v.string(), intervalMs: v.number() },
      handler: async () => 0,
    }),
  }),
  "./providerHealth.ts": async () => jest.requireActual("./providerHealth"),
  "./cardCatalog.ts": async () => jest.requireActual("./cardCatalog"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
}

describe("deck catalog search", () => {
  it("serves cached top decks to guests without refreshing providers", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("network unavailable"))
    const t = convexTest(schema, modules)
    try {
      await t.run(async (ctx) => {
        await ctx.db.insert("deckCatalogs", {
          game: "ygo",
          source: "fixture",
          externalId: "guest-cached",
          kind: "top",
          name: "Guest Cached Deck",
          format: "advanced",
          fetchedAt: Date.now(),
        })
      })

      await expect(
        t.action(api.deckCatalogs.searchTopDecks, {
          game: "ygo",
          query: "guest",
          format: "advanced",
        }),
      ).resolves.toMatchObject([{ externalId: "guest-cached" }])
      await expect(
        t.action(api.deckCatalogs.searchTopDecks, { game: "ygo", query: "missing" }),
      ).resolves.toEqual([])
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("keeps the release gate on guest top-deck searches", async () => {
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert("integrationOverrides", {
        game: "ygo",
        capability: "exampleDecks",
        release: "disabled",
        updatedAt: Date.now(),
      })
    })

    await expect(
      t.action(api.deckCatalogs.searchTopDecks, { game: "ygo", query: "" }),
    ).rejects.toMatchObject({ data: { code: "capability_unavailable" } })
  })

  it.each(["", "shared archetype"])(
    "filters by format before limiting results for query %j",
    async (query) => {
      const t = convexTest(schema, modules)
      await t.run(async (ctx) => {
        await ctx.db.insert("deckCatalogs", {
          game: "ygo",
          source: "fixture",
          externalId: "traditional-match",
          kind: "top",
          name: "Shared Archetype Target",
          format: "traditional",
          fetchedAt: 1,
        })
        for (let index = 0; index < 35; index += 1) {
          await ctx.db.insert("deckCatalogs", {
            game: "ygo",
            source: "fixture",
            externalId: `advanced-${index}`,
            kind: "top",
            name: `Shared Archetype ${index}`,
            format: "advanced",
            fetchedAt: index + 2,
          })
        }
      })

      await expect(
        t.query(internal.deckCatalogs.searchCached, {
          game: "ygo",
          query,
          format: "traditional",
          kind: "top",
        }),
      ).resolves.toMatchObject([{ externalId: "traditional-match", format: "traditional" }])
    },
  )
})

it.each(["expanded", undefined])(
  "refreshes Pokémon format %s independently and reuses its cache",
  async (requestedFormat) => {
    const expectedFormat = requestedFormat ?? "standard"
    const otherFormat = expectedFormat === "standard" ? "expanded" : "standard"
    const t = convexTest(schema, modules)
    await t.run(async (ctx) => {
      await ctx.db.insert("deckCatalogs", {
        game: "pokemon",
        source: "fixture",
        externalId: otherFormat,
        kind: "tournament",
        name: "Other format deck",
        format: otherFormat,
        fetchedAt: Date.now(),
      })
    })
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input)
      const body = url.includes("/tournaments?")
        ? [
            { id: "expanded-one", name: "First event", format: expectedFormat.toUpperCase() },
            { id: "expanded-two", name: "Second event", format: expectedFormat.toUpperCase() },
          ]
        : url.endsWith("/standings")
          ? [
              {
                player: "winner",
                placing: 1,
                deck: { name: "Expanded deck" },
                decklist: { pokemon: [{ name: "Pikachu", set: "BS", number: "58", count: 60 }] },
              },
            ]
          : []
      return new Response(JSON.stringify(body), { status: 200 })
    })
    try {
      const actor = t.withIdentity({ subject: "catalog-reader" })
      const decks = await actor.action(api.deckCatalogs.searchTopDecks, {
        game: "pokemon",
        format: requestedFormat,
        query: "",
      })
      expect(decks).toHaveLength(2)
      expect(decks.every((deck) => deck.format === expectedFormat)).toBe(true)
      expect(
        fetchSpy.mock.calls.some(([url]) =>
          String(url).includes(`format=${expectedFormat.toUpperCase()}`),
        ),
      ).toBe(true)
      const fetchCount = fetchSpy.mock.calls.length
      await expect(
        actor.action(api.deckCatalogs.searchTopDecks, {
          game: "pokemon",
          format: requestedFormat,
          query: "",
        }),
      ).resolves.toHaveLength(2)
      expect(fetchSpy).toHaveBeenCalledTimes(fetchCount)
    } finally {
      fetchSpy.mockRestore()
    }
  },
)

it.each(["standard", "expanded"])("caches a successful empty %s feed", async (format) => {
  const t = convexTest(schema, modules)
  const actor = t.withIdentity({ subject: "empty-catalog-reader" })
  const fetchSpy = jest
    .spyOn(global, "fetch")
    .mockImplementation(async () => new Response("[]", { status: 200 }))
  try {
    const args = { game: "pokemon", format, query: "" }
    await expect(actor.action(api.deckCatalogs.searchTopDecks, args)).resolves.toEqual([])
    await expect(actor.action(api.deckCatalogs.searchTopDecks, args)).resolves.toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  } finally {
    fetchSpy.mockRestore()
  }
})
