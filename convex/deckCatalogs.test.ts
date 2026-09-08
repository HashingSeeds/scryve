import { v } from "convex/values"
import { convexTest } from "convex-test"

import { registerRateLimiter } from "../test/registerRateLimiter"
import { api, internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import { DECK_GAME_LIST } from "./lib/deckGames"
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
  it.each([
    ["pokemon", "standard"],
    ["ygo", "advanced"],
  ])(
    "shares the %s cache for 24 hours, then refreshes behind stale results",
    async (game, format) => {
      jest.useFakeTimers()
      const fetchedAt = Date.now()
      const t = convexTest(schema, modules)
      registerRateLimiter(t)
      const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("provider offline"))
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
      try {
        await t.run(async (ctx) => {
          await ctx.db.insert("deckCatalogs", {
            game,
            source: "fixture",
            externalId: "shared-cache",
            kind: "tournament",
            name: "Shared deck",
            format,
            fetchedAt,
          })
        })
        const firstUser = t.withIdentity({ subject: "first-reader" })
        const secondUser = t.withIdentity({ subject: "second-reader" })
        const args = { game, format, query: "" }
        jest.setSystemTime(fetchedAt + 24 * 60 * 60 * 1000 - 1)
        const cached = await firstUser.action(api.deckCatalogs.searchTopDecks, args)
        await expect(secondUser.action(api.deckCatalogs.searchTopDecks, args)).resolves.toEqual(
          cached,
        )
        expect(fetchSpy).not.toHaveBeenCalled()
        await t.run(async (ctx) => {
          expect(await ctx.db.system.query("_scheduled_functions").collect()).toHaveLength(0)
        })

        jest.setSystemTime(fetchedAt + 24 * 60 * 60 * 1000)
        await expect(firstUser.action(api.deckCatalogs.searchTopDecks, args)).resolves.toEqual(
          cached,
        )
        await expect(secondUser.action(api.deckCatalogs.searchTopDecks, args)).resolves.toEqual(
          cached,
        )
        await expect(
          secondUser.action(api.deckCatalogs.searchTopDecks, { ...args, query: "missing" }),
        ).resolves.toEqual([])
        expect(fetchSpy).not.toHaveBeenCalled()
        await t.run(async (ctx) => {
          expect(await ctx.db.system.query("_scheduled_functions").collect()).toHaveLength(1)
        })
        await t.finishAllScheduledFunctions(() => jest.runAllTimers())
        expect(fetchSpy).toHaveBeenCalledTimes(1)
        jest.advanceTimersByTime(5 * 60 * 1000)
        await expect(secondUser.action(api.deckCatalogs.searchTopDecks, args)).resolves.toEqual(
          cached,
        )
        await t.finishAllScheduledFunctions(() => jest.runAllTimers())
        expect(fetchSpy).toHaveBeenCalledTimes(2)
      } finally {
        errorSpy.mockRestore()
        fetchSpy.mockRestore()
        jest.useRealTimers()
      }
    },
  )

  it("serves cached top decks to guests without refreshing providers", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("network unavailable"))
    const t = convexTest(schema, modules)
    registerRateLimiter(t)
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
    registerRateLimiter(t)
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
      registerRateLimiter(t)
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
    jest.useFakeTimers()
    const startedAt = Date.now()
    const expectedFormat = requestedFormat ?? "standard"
    const otherFormat = expectedFormat === "standard" ? "expanded" : "standard"
    const t = convexTest(schema, modules)
    registerRateLimiter(t)
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
        t
          .withIdentity({ subject: "another-catalog-reader" })
          .action(api.deckCatalogs.searchTopDecks, {
            game: "pokemon",
            format: requestedFormat,
            query: "",
          }),
      ).resolves.toHaveLength(2)
      expect(fetchSpy).toHaveBeenCalledTimes(fetchCount)

      jest.setSystemTime(startedAt + 24 * 60 * 60 * 1000)
      await expect(
        actor.action(api.deckCatalogs.searchTopDecks, {
          game: "pokemon",
          format: requestedFormat,
          query: "",
        }),
      ).resolves.toEqual(decks)
      expect(fetchSpy).toHaveBeenCalledTimes(fetchCount)
      await t.finishAllScheduledFunctions(() => jest.runAllTimers())
      expect(fetchSpy).toHaveBeenCalledTimes(fetchCount * 2)
      const refreshed = await t
        .withIdentity({ subject: "reader-after-refresh" })
        .action(api.deckCatalogs.searchTopDecks, {
          game: "pokemon",
          format: requestedFormat,
          query: "",
        })
      expect(refreshed).toHaveLength(2)
      expect(refreshed.every((deck) => deck.fetchedAt > startedAt)).toBe(true)
      expect(fetchSpy).toHaveBeenCalledTimes(fetchCount * 2)
    } finally {
      fetchSpy.mockRestore()
      jest.useRealTimers()
    }
  },
)

it.each(["standard", "expanded"])("caches a successful empty %s feed", async (format) => {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
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

it("seeds complete Magic examples once and returns legacy fields for local saves", async () => {
  const t = convexTest(schema, modules)
  const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"))
  try {
    for (const format of ["standard", "pioneer", "modern", "pauper"]) {
      const result = await t.action(api.deckCatalogs.browse, { game: "mtg", format, query: "" })
      expect(result.status).toBe("ready")
      expect(result.decks).toHaveLength(2)
      for (const deck of result.decks) {
        expect(deck.sourceUrl).toMatch(/^https:\/\/www\.mtgo\.com\/decklist\//)
        const detail = await t.query(api.deckCatalogs.detail, { catalogDeckId: deck._id })
        expect(
          detail.entries
            .filter((card) => card.board === "main")
            .reduce((sum, card) => sum + card.quantity, 0),
        ).toBe(60)
        expect(
          detail.entries
            .filter((card) => card.board === "sideboard")
            .reduce((sum, card) => sum + card.quantity, 0),
        ).toBe(15)
        expect(detail.entries.every((card) => card.oracleId && card.scryfallId)).toBe(true)
      }
      const repeated = await t.action(api.deckCatalogs.browse, { game: "mtg", format, query: "" })
      expect(repeated.decks).toEqual(result.decks)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})

it("lets guests populate a cold feed and rate limits repeated provider failures", async () => {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"))
  try {
    const args = { game: "pokemon", format: "standard", query: "" }
    await expect(t.action(api.deckCatalogs.browse, args)).resolves.toMatchObject({
      status: "unavailable",
      decks: [],
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await expect(t.action(api.deckCatalogs.browse, args)).resolves.toMatchObject({
      status: "unavailable",
      retryAfterMs: expect.any(Number),
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  } finally {
    fetchSpy.mockRestore()
  }
})

it("admits one simultaneous refresh per format without consuming other formats' quota", async () => {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  const args = { game: "pokemon", format: "standard", background: false }
  const results = await Promise.all(
    Array.from({ length: 5 }, () => t.mutation(internal.deckCatalogs.requestRefresh, args)),
  )
  expect(results.filter((result) => result.ok)).toHaveLength(1)
  expect(results.filter((result) => !result.ok).every((result) => result.retryAfter! > 0)).toBe(
    true,
  )
  await expect(
    t.mutation(internal.deckCatalogs.requestRefresh, { ...args, format: "expanded" }),
  ).resolves.toMatchObject({ ok: true })
})

it("retains stale decks while a background refresh fails", async () => {
  jest.useFakeTimers()
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"))
  try {
    await t.run(async (ctx) => {
      await ctx.db.insert("deckCatalogs", {
        game: "pokemon",
        source: "limitless",
        externalId: "last-good",
        name: "Keep this deck",
        kind: "tournament",
        format: "standard",
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
      })
    })
    const args = { game: "pokemon", format: "standard", query: "" }
    const first = await t.action(api.deckCatalogs.browse, args)
    expect(first.status).toBe("refreshing")
    expect(first.decks[0].name).toBe("Keep this deck")
    await t.finishAllScheduledFunctions(() => jest.runAllTimers())
    const second = await t.action(api.deckCatalogs.browse, args)
    expect(second.status).toBe("unavailable")
    expect(second.decks).toEqual(first.decks)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  } finally {
    fetchSpy.mockRestore()
    jest.useRealTimers()
  }
})

it("paginates within one format and preserves cached access during a refresh limit", async () => {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  await t.run(async (ctx) => {
    for (let i = 0; i < 36; i++)
      await ctx.db.insert("deckCatalogs", {
        game: "ygo",
        source: "fixture",
        externalId: String(i),
        name: `Deck ${i}`,
        kind: "tournament",
        format: "advanced",
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
      })
  })
  await t.mutation(internal.deckCatalogs.requestRefresh, {
    game: "ygo",
    format: "advanced",
    background: false,
  })
  const args = { game: "ygo", format: "advanced", query: "" }
  const first = await t.action(api.deckCatalogs.browse, args)
  expect(first.status).toBe("rate_limited")
  expect(first.decks).toHaveLength(30)
  expect(first.cursor).not.toBeNull()
  const second = await t.action(api.deckCatalogs.browse, { ...args, cursor: first.cursor! })
  expect(second.decks).toHaveLength(6)
  expect(second.cursor).toBeNull()
  expect(new Set([...first.decks, ...second.decks].map((deck) => deck._id)).size).toBe(36)
})

it("does not fetch a provider for unsupported formats", async () => {
  const t = convexTest(schema, modules)
  const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("unexpected"))
  try {
    await expect(
      t.action(api.deckCatalogs.browse, { game: "ygo", format: "rush", query: "" }),
    ).resolves.toMatchObject({ status: "unsupported", decks: [] })
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})

it("provides two complete, attributed examples for every selectable format without a provider", async () => {
  const t = convexTest(schema, modules)
  const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"))
  try {
    for (const game of DECK_GAME_LIST) {
      for (const format of game.formats) {
        const args = { game: game.id, format: format.id, query: "", source: "examples" as const }
        const result = await t.action(api.deckCatalogs.browse, args)
        expect(result.status).toBe("ready")
        expect(result.decks.length).toBeGreaterThanOrEqual(2)
        for (const deck of result.decks) {
          expect(deck.kind).toBe("example")
          expect(deck.sourceUrl).toMatch(/^https:\/\//)
          const detail = await t.query(api.deckCatalogs.detail, { catalogDeckId: deck._id })
          expect(detail.entries.every((card) => card.cardId && card.quantity > 0)).toBe(true)
          expect(
            detail.entries.every((card) => format.sections.some((s) => s.id === card.section)),
          ).toBe(true)
          const main = detail.entries
            .filter((c) => c.section === "main")
            .reduce((n, c) => n + c.quantity, 0)
          expect(main).toBeGreaterThanOrEqual(game.id === "pokemon" ? 60 : 40)
          if (game.id === "mtg")
            expect(detail.entries.every((c) => c.oracleId && c.scryfallId)).toBe(true)
        }
        expect((await t.action(api.deckCatalogs.browse, args)).decks).toEqual(result.decks)
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})

it.each(["ygo", "pokemon"])(
  "separates %s official decks from examples and allows seed updates",
  async (game) => {
    const t = convexTest(schema, modules)
    const args = {
      game,
      format: game === "ygo" ? "rush" : "standard",
      query: "",
      source: "official" as const,
    }
    const result = await t.action(api.deckCatalogs.browse, args)
    expect(result.decks.length).toBeGreaterThanOrEqual(2)
    expect(result.decks.every((deck) => deck.kind === "official")).toBe(true)
    const deck = result.decks[0]
    await t.run(async (ctx) => ctx.db.patch(deck._id, { name: "Old selection" }))
    await t.mutation(internal.deckCatalogs.seedCuratedDecks, {
      game,
      format: args.format,
      overwrite: true,
    })
    expect((await t.query(api.deckCatalogs.detail, { catalogDeckId: deck._id })).deck.name).toBe(
      deck.name,
    )
  },
)

it.each(["ygo", "pokemon"])("browses %s examples and official decks in one list", async (game) => {
  const t = convexTest(schema, modules)
  const args = {
    game,
    format: game === "ygo" ? "rush" : "standard",
    query: "",
    source: "all" as const,
  }
  const result = await t.action(api.deckCatalogs.browse, args)
  expect(result.decks.some((deck) => deck.kind === "official")).toBe(true)
  expect(result.decks.some((deck) => deck.kind === "example")).toBe(true)
  expect(
    result.decks.every((deck) => deck.source && deck.sourceUrl && deck.format === args.format),
  ).toBe(true)
  const filtered = await t.action(api.deckCatalogs.browse, { ...args, query: result.decks[0].name })
  expect(filtered.decks.some((deck) => deck._id === result.decks[0]._id)).toBe(true)
})
