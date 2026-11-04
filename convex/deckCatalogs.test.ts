import { v } from "convex/values"
import { convexTest } from "convex-test"

import { makeConvexTest } from "../test/convexTest"
import { registerRateLimiter } from "../test/registerRateLimiter"
import { api, internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import { DECK_GAME_LIST } from "./lib/deckGames"
import { integration } from "./lib/integrations"
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

it("counts a successful empty Limitless refresh as the newest fetch, but not a YGOPRODeck one", async () => {
  const t = convexTest(schema, modules)
  const lastSuccessAt = Date.now()
  const success = { status: "healthy" as const, lastAttemptAt: lastSuccessAt, lastSuccessAt }
  await t.mutation(internal.providerHealth.record, {
    ...success,
    game: "pokemon",
    provider: "limitless",
    operation: "deck-feed-refresh:standard",
    message: "0 decks",
  })
  await t.mutation(internal.providerHealth.record, {
    ...success,
    game: "ygo",
    provider: "ygoprodeck-decks",
    operation: "deck-feed-refresh",
    message: "0 decks",
  })
  await expect(
    t.query(internal.deckCatalogs.latestFetch, { game: "pokemon", format: "standard" }),
  ).resolves.toEqual({ fetchedAt: lastSuccessAt })
  await expect(
    t.query(internal.deckCatalogs.latestFetch, { game: "ygo", format: "advanced" }),
  ).resolves.toBeNull()
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
  expect(first.status).toBe("refreshing")
  expect(first.retryAfterMs).toEqual(expect.any(Number))
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
    for (const game of DECK_GAME_LIST.filter(
      ({ id }) =>
        id !== "fab" &&
        id !== "lorcana" &&
        integration(id)?.capabilities.exampleDecks.technical === "available",
    )) {
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
          expect(main).toBeGreaterThanOrEqual(
            game.id === "pokemon" ? 60 : format.id === "speed" ? 20 : 40,
          )
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

describe("Limitless sourceUrl backfill", () => {
  it("rewrites only stale Limitless rows and is a no-op on rerun", async () => {
    const t = convexTest(schema, modules)
    const oldUrl = "https://play.limitlesstcg.com/tournament/t1/standings"
    const newUrl = "https://play.limitlesstcg.com/tournament/t2/player/bob/decklist"
    const base = { kind: "tournament", name: "Deck", fetchedAt: 1 }
    const ids = await t.run(async (ctx) => ({
      stale: await ctx.db.insert("deckCatalogs", {
        ...base,
        game: "pokemon",
        source: "limitless",
        externalId: "t1:a b",
        sourceUrl: oldUrl,
      }),
      current: await ctx.db.insert("deckCatalogs", {
        ...base,
        game: "pokemon",
        source: "limitless",
        externalId: "t2:bob",
        sourceUrl: newUrl,
      }),
      unparseable: await ctx.db.insert("deckCatalogs", {
        ...base,
        game: "pokemon",
        source: "limitless",
        externalId: "nocolon",
        sourceUrl: oldUrl,
      }),
      other: await ctx.db.insert("deckCatalogs", {
        ...base,
        game: "pokemon",
        source: "fixture",
        externalId: "t1:a",
        sourceUrl: oldUrl,
      }),
    }))
    const urls = () =>
      t.run(async (ctx) => ({
        stale: (await ctx.db.get(ids.stale))?.sourceUrl,
        current: (await ctx.db.get(ids.current))?.sourceUrl,
        unparseable: (await ctx.db.get(ids.unparseable))?.sourceUrl,
        other: (await ctx.db.get(ids.other))?.sourceUrl,
      }))

    jest.useFakeTimers()
    try {
      await t.mutation(internal.deckCatalogs.backfillLimitlessSourceUrls, {
        paginationOpts: { numItems: 50, cursor: null },
      })
      await t.finishAllScheduledFunctions(() => jest.runAllTimers())
      const after = await urls()
      expect(after).toEqual({
        stale: "https://play.limitlesstcg.com/tournament/t1/player/a%20b/decklist",
        current: newUrl,
        unparseable: oldUrl,
        other: oldUrl,
      })

      await t.mutation(internal.deckCatalogs.backfillLimitlessSourceUrls, {
        paginationOpts: { numItems: 50, cursor: null },
      })
      await t.finishAllScheduledFunctions(() => jest.runAllTimers())
      expect(await urls()).toEqual(after)
    } finally {
      jest.useRealTimers()
    }
  })
})

it("pruning a feed keeps its newest decks and leaves other sources alone", async () => {
  jest.useFakeTimers()
  try {
    const t = convexTest(schema, modules)
    const deck = (source: string, fetchedAt: number) => ({
      game: "pokemon",
      source,
      externalId: `${source}-${fetchedAt}`,
      kind: "tournament",
      name: `Deck ${fetchedAt}`,
      format: "standard",
      fetchedAt,
    })
    await t.run(async (ctx) => {
      await ctx.db.insert("deckCatalogs", deck("curated", 0))
      for (let fetchedAt = 1; fetchedAt <= 100; fetchedAt++) {
        const catalogDeckId = await ctx.db.insert("deckCatalogs", deck("limitless", fetchedAt))
        await ctx.db.insert("deckCatalogCards", {
          catalogDeckId,
          game: "pokemon",
          name: "Pikachu",
          quantity: 4,
          section: "main",
          entryKind: "card",
        })
      }
    })

    await t.mutation(internal.deckCatalogs.pruneFeed, {
      game: "pokemon",
      format: "standard",
      source: "limitless",
    })
    await t.finishAllScheduledFunctions(() => jest.runAllTimers())

    const { decks, cards } = await t.run(async (ctx) => ({
      decks: await ctx.db.query("deckCatalogs").collect(),
      cards: await ctx.db.query("deckCatalogCards").collect(),
    }))
    const fetched = decks.map((row) => row.fetchedAt).sort((a, b) => a - b)
    expect(fetched).toEqual([0, ...Array.from({ length: 50 }, (_, index) => 51 + index)])
    expect(cards).toHaveLength(50)
  } finally {
    jest.useRealTimers()
  }
})

it("refreshing a catalog deck rewrites its cards only when they changed", async () => {
  const t = convexTest(schema, modules)
  const deck = {
    game: "mtg",
    source: "fixture",
    externalId: "deck-1",
    kind: "example",
    name: "Fixture Deck",
    format: "modern",
    entries: [{ name: "Island", quantity: 20, section: "main", entryKind: "card" }],
  }
  const cardIds = async (catalogDeckId: string) =>
    await t.run(async (ctx) =>
      (await ctx.db.query("deckCatalogCards").collect())
        .filter((card) => card.catalogDeckId === catalogDeckId)
        .map((card) => card._id),
    )

  const catalogDeckId = await t.mutation(internal.deckCatalogs.upsert, deck)
  const first = await cardIds(catalogDeckId)
  await t.mutation(internal.deckCatalogs.upsert, deck)
  expect(await cardIds(catalogDeckId)).toEqual(first)

  await t.mutation(internal.deckCatalogs.upsert, {
    ...deck,
    entries: [{ ...deck.entries[0], quantity: 19 }],
  })
  const changed = await cardIds(catalogDeckId)
  expect(changed).toHaveLength(1)
  expect(changed).not.toEqual(first)
})

describe("Browse list", () => {
  const browsable = DECK_GAME_LIST.filter(
    ({ id }) => integration(id)?.capabilities.exampleDecks.technical === "available",
  )

  it.each(browsable.map((game) => [game.id, game] as const))(
    "lists each %s format's decks from the stored catalog",
    async (_id, game) => {
      const t = makeConvexTest()
      await t.run(async (ctx) => {
        for (const format of game.formats)
          await ctx.db.insert("deckCatalogs", {
            game: game.id,
            source: "fixture",
            externalId: format.id,
            kind: "tournament",
            name: `Stored ${format.id}`,
            format: format.id,
            fetchedAt: 1,
          })
      })
      for (const format of game.formats) {
        const listed = await t.query(api.deckCatalogs.list, {
          game: game.id,
          format: format.id,
          query: "",
        })
        expect(listed.map((deck) => deck.name)).toEqual([`Stored ${format.id}`])
      }
    },
  )

  it("puts Magic precons in Browse newest first and keeps them out of older clients' lists", async () => {
    jest.useFakeTimers()
    const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"))
    try {
      const t = makeConvexTest()
      await t.mutation(internal.deckImports.storeCatalog, {
        decks: [
          {
            fileName: "Old_C16",
            name: "Old Commander",
            type: "Commander Deck",
            releaseDate: "2016-11-11",
          },
          {
            fileName: "New_FDC",
            name: "New Commander",
            type: "Commander Deck",
            releaseDate: "2025-11-14",
          },
          {
            fileName: "Theme_M10",
            name: "Theme Deck",
            type: "Theme Deck",
            releaseDate: "2009-07-17",
          },
        ],
      })
      await t.finishAllScheduledFunctions(() => jest.runAllTimers())
      const commander = await t.query(api.deckCatalogs.list, {
        game: "mtg",
        format: "commander",
        query: "",
      })
      expect(commander.map((deck) => [deck.name, deck.kind])).toEqual([
        ["New Commander", "official"],
        ["Old Commander", "official"],
      ])
      const searched = await t.query(api.deckCatalogs.list, {
        game: "mtg",
        format: "constructed",
        query: "theme",
      })
      expect(searched.map((deck) => deck.externalId)).toEqual(["Theme_M10"])
      const legacy = await t.action(api.deckCatalogs.browse, {
        game: "mtg",
        format: "commander",
        query: "",
        source: "all",
      })
      expect(legacy.decks.length).toBeGreaterThan(0)
      expect(legacy.decks.some((deck) => deck.source === "mtgjson")).toBe(false)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
      jest.useRealTimers()
    }
  })

  it("syncs every precon across batches and updates a changed one in place", async () => {
    jest.useFakeTimers()
    try {
      const t = makeConvexTest()
      const decks = Array.from({ length: 201 }, (_, index) => ({
        fileName: `Deck${index}_SET`,
        name: `Deck ${index}`,
        type: "Commander Deck",
        releaseDate: "2020-01-01",
      }))
      await t.mutation(internal.deckImports.storeCatalog, { decks })
      await t.finishAllScheduledFunctions(() => jest.runAllTimers())
      await t.mutation(internal.deckImports.storeCatalog, {
        decks: decks.map((deck, index) =>
          index === 200 ? { ...deck, name: "Renamed", releaseDate: "2025-06-01" } : deck,
        ),
      })
      await t.finishAllScheduledFunctions(() => jest.runAllTimers())
      const rows = await t.run(
        async (ctx) =>
          await ctx.db
            .query("deckCatalogs")
            .withIndex("by_game_and_source_and_external_id", (q) =>
              q.eq("game", "mtg").eq("source", "mtgjson"),
            )
            .collect(),
      )
      expect(rows).toHaveLength(201)
      expect(rows.find((row) => row.externalId === "Deck200_SET")).toMatchObject({
        name: "Renamed",
        publishedAt: Date.parse("2025-06-01"),
      })
    } finally {
      jest.useRealTimers()
    }
  })

  it("fills command-zone precon colors from each deck file and filters Browse by exact identity", async () => {
    const files: Record<string, unknown> = {
      "Gisa_FDC.json": { commander: [{ name: "Ghoulcaller Gisa", colorIdentity: ["B"] }] },
      "Atraxa_C16.json": {
        commander: [{ name: "Atraxa, Praetors' Voice", colorIdentity: ["G", "W", "U", "B"] }],
        mainBoard: [{ name: "Mountain", colorIdentity: ["R"] }],
      },
    }
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const file = String(input).split("/").pop() ?? ""
      return new Response(JSON.stringify({ data: files[file] }), { status: 200 })
    })
    try {
      const t = makeConvexTest()
      await t.run(async (ctx) => {
        for (const [externalId, format] of [
          ["Gisa_FDC", "commander"],
          ["Atraxa_C16", "commander"],
          ["Theme_M10", "constructed"],
        ])
          await ctx.db.insert("deckCatalogs", {
            game: "mtg",
            source: "mtgjson",
            externalId,
            kind: "official",
            name: externalId,
            format,
            fetchedAt: 1,
          })
      })
      await t.action(internal.deckImports.fillPreconIdentity, { cursor: null })
      await t.action(internal.deckImports.fillPreconIdentity, { cursor: null })
      expect(fetchSpy.mock.calls.map(([input]) => String(input).split("/").pop())).toEqual([
        "Atraxa_C16.json",
        "Gisa_FDC.json",
      ])
      const browse = async (colors?: string[]) =>
        (
          await t.query(api.deckCatalogs.list, {
            game: "mtg",
            format: "commander",
            query: "",
            ...(colors ? { colors } : {}),
          })
        ).map((deck) => [deck.externalId, deck.identityColors])
      expect(await browse()).toEqual(
        expect.arrayContaining([
          ["Gisa_FDC", ["B"]],
          ["Atraxa_C16", ["W", "U", "B", "G"]],
        ]),
      )
      expect(await browse(["B"])).toEqual([["Gisa_FDC", ["B"]]])
      expect(await browse(["G", "B", "U", "W"])).toEqual([["Atraxa_C16", ["W", "U", "B", "G"]]])
      expect(await browse(["C"])).toEqual([])
      const theme = await t.run(
        async (ctx) =>
          await ctx.db
            .query("deckCatalogs")
            .withIndex("by_game_and_source_and_external_id", (q) =>
              q.eq("game", "mtg").eq("source", "mtgjson").eq("externalId", "Theme_M10"),
            )
            .unique(),
      )
      expect(theme?.identityColors).toBeUndefined()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("gives an already seeded curated Commander deck its colors", async () => {
    const t = makeConvexTest()
    await t.run(async (ctx) => {
      await ctx.db.insert("deckCatalogs", {
        game: "mtg",
        source: "wizards-examples",
        externalId: "wizards-scd-first-flight",
        kind: "example",
        name: "First Flight Starter Commander",
        format: "commander",
        fetchedAt: 1,
      })
    })
    await t.mutation(internal.deckCatalogs.seedCuratedDecks, { game: "mtg", format: "commander" })
    const listed = await t.query(api.deckCatalogs.list, {
      game: "mtg",
      format: "commander",
      query: "",
      colors: ["W", "U"],
    })
    expect(listed.map((deck) => deck.externalId)).toEqual(["wizards-scd-first-flight"])
  })

  it("fills precon rows for a deck list stored before they existed", async () => {
    jest.useFakeTimers()
    const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"))
    try {
      const t = makeConvexTest()
      await t.run(async (ctx) => {
        await ctx.db.insert("preconCatalogs", {
          fetchedAt: Date.now(),
          decks: [{ fileName: "AtraxaInfect", name: "Atraxa Infect", type: "Commander Deck" }],
        })
      })
      await expect(
        t.action(api.deckCatalogs.ensureFresh, { game: "mtg", format: "commander" }),
      ).resolves.toEqual({ status: "ready" })
      await t.finishAllScheduledFunctions(() => jest.runAllTimers())
      const listed = await t.query(api.deckCatalogs.list, {
        game: "mtg",
        format: "commander",
        query: "atraxa",
      })
      expect(listed.map((deck) => deck.externalId)).toEqual(["AtraxaInfect"])
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
      jest.useRealTimers()
    }
  })
})
