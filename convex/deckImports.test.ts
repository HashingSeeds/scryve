import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import { parseGenericDeckList, parsePastedDeckList } from "./deckImports"
import schema from "./schema"

const REFRESH_LEASE_MS = 5 * 60 * 1000

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./cards.ts": async () => jest.requireActual("./cards"),
  "./cardCatalog.ts": async () => jest.requireActual("./cardCatalog"),
  "./deckImports.ts": async () => jest.requireActual("./deckImports"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./externalApiRateLimits.ts": async () => jest.requireActual("./externalApiRateLimits"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./providerHealth.ts": async () => jest.requireActual("./providerHealth"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const deckListPayload = {
  data: [
    {
      fileName: "AtraxaInfect",
      name: "Atraxa Infect",
      code: "C16",
      releaseDate: "2016-11-11",
      type: "Commander Deck",
    },
  ],
}

function deckListResponse() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => deckListPayload,
  } as unknown as Response)
}

const preconCardId = "22222222-2222-2222-2222-222222222222"

function resolvedPreconResponse(url: string, deckName = "Avengers Assemble") {
  if (url.includes("mtgjson.com"))
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          name: deckName,
          commander: [
            {
              name: "Captain America, Team Leader",
              count: 1,
              identifiers: { scryfallId: preconCardId },
            },
          ],
          mainBoard: [],
          sideBoard: [],
        },
      }),
    } as unknown as Response)
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          id: preconCardId,
          oracle_id: "11111111-1111-1111-1111-111111111111",
          name: "Captain America, Team Leader",
          set_name: "Marvel's Spider-Man",
          image_uris: {
            normal: "https://cards.scryfall.io/normal/captain-america.jpg",
            small: "https://cards.scryfall.io/small/captain-america.jpg",
          },
        },
      ],
      not_found: [],
    }),
  } as unknown as Response)
}

describe("deck list parsing", () => {
  it("parses common exported formats and preserves deck sections", () => {
    expect(
      parsePastedDeckList(`
Commander
1 Atraxa, Praetors' Voice (2X2) 186

Mainboard:
1x Sol Ring
2 Island (M21) 265

Sideboard
1 Swan Song *F*
`),
    ).toEqual({
      entries: [
        { name: "Atraxa, Praetors' Voice", quantity: 1, board: "commander" },
        { name: "Sol Ring", quantity: 1, board: "main" },
        { name: "Island", quantity: 2, board: "main" },
        { name: "Swan Song", quantity: 1, board: "sideboard" },
      ],
      invalidLines: [],
    })
  })

  it("combines duplicate entries and reports malformed lines", () => {
    expect(parsePastedDeckList("1 Sol Ring\n2 Sol Ring\nSol Ring")).toEqual({
      entries: [{ name: "Sol Ring", quantity: 3, board: "main" }],
      invalidLines: ["Sol Ring"],
    })
  })

  it("ignores maybeboard and token sections", () => {
    expect(parsePastedDeckList("1 Forest\nMaybeboard\n1 Island\nTokens\n1 Treasure Token")).toEqual(
      {
        entries: [{ name: "Forest", quantity: 1, board: "main" }],
        invalidLines: [],
      },
    )
  })
})

describe("Yu-Gi-Oh! deck list parsing", () => {
  function ydkeSection(ids: number[]) {
    const bytes = new Uint8Array(ids.length * 4)
    const view = new DataView(bytes.buffer)
    ids.forEach((id, index) => view.setUint32(index * 4, id, true))
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
  }

  it("decodes YDKE links and retains main, extra, and side sections", () => {
    const list = `ydke://${ydkeSection([46986414, 46986414])}!${ydkeSection([84013237])}!${ydkeSection([14558127])}!`

    expect(parseGenericDeckList(list, "ygo")).toEqual({
      entries: [
        {
          name: "Card 46986414",
          quantity: 2,
          section: "main",
          originalReference: "46986414",
          providerCardId: "46986414",
          sectionExplicit: true,
        },
        {
          name: "Card 84013237",
          quantity: 1,
          section: "extra",
          originalReference: "84013237",
          providerCardId: "84013237",
          sectionExplicit: true,
        },
        {
          name: "Card 14558127",
          quantity: 1,
          section: "side",
          originalReference: "14558127",
          providerCardId: "14558127",
          sectionExplicit: true,
        },
      ],
      invalidLines: [],
    })
  })

  it("rejects malformed YDKE payloads", () => {
    expect(() => parseGenericDeckList("ydke://broken!also-broken!still-broken!", "ygo")).toThrow(
      "This YDKE link is invalid",
    )
  })
})

describe("generic deck resolution", () => {
  it("reuses normalized lookups across sections", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 1,
              name: "Shared Card",
              type: "Effect Monster",
              frameType: "effect",
              card_images: [{ id: 1 }],
            },
          ],
        }),
        { status: 200 },
      ),
    )
    try {
      const t = convexTest(schema, modules)
      const actor = t.withIdentity({ subject: "generic-deck-importer" })

      const result = await actor.action(api.deckImports.resolvePasted, {
        game: "ygo",
        list: "Main Deck\n1 Shared Card\nSide Deck\n2 shared   card",
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(result.cards).toMatchObject([
        {
          name: "Shared Card",
          quantity: 1,
          section: "main",
          originalReference: "Shared Card",
        },
        {
          name: "Shared Card",
          quantity: 2,
          section: "side",
          originalReference: "shared   card",
        },
      ])
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("caches every unique card returned by batched provider lookups", async () => {
    const ids = Array.from({ length: 53 }, (_, index) => String(10_000 + index))
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const requestedIds = new URL(String(input)).searchParams.get("id")?.split(",") ?? []
      return new Response(
        JSON.stringify({
          data: requestedIds.map((id) => ({
            id: Number(id),
            name: `Card ${id}`,
            type: "Effect Monster",
            frameType: "effect",
            card_images: [{ id: Number(id) }],
          })),
        }),
        { status: 200 },
      )
    })
    try {
      const t = convexTest(schema, modules)
      const actor = t.withIdentity({ subject: "batched-deck-importer" })

      await actor.action(api.deckImports.resolvePasted, {
        game: "ygo",
        list: ids.join("\n"),
      })

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(
        fetchSpy.mock.calls.map(
          ([input]) => new URL(String(input)).searchParams.get("id")?.split(",").length,
        ),
      ).toEqual([40, 13])
      await expect(
        t.run(async (ctx) => await ctx.db.query("gameCards").collect()),
      ).resolves.toHaveLength(ids.length)
      await expect(
        t.run(async (ctx) => await ctx.db.query("cardPrintings").collect()),
      ).resolves.toHaveLength(ids.length)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("preserves distinct Pokémon printings with the same card name", async () => {
    const pokemonCard = (id: string, localId: string) => ({
      id,
      localId,
      name: "Pikachu",
      category: "Pokemon",
      set: { id: id.split("-")[0] },
    })
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/cards/seta-1"))
        return new Response(JSON.stringify(pokemonCard("seta-1", "1")), { status: 200 })
      if (url.pathname.endsWith("/cards/setb-2"))
        return new Response(JSON.stringify(pokemonCard("setb-2", "2")), { status: 200 })
      const localId = url.searchParams.get("localId")
      return new Response(
        JSON.stringify(
          localId === "1" ? [pokemonCard("seta-1", "1")] : [pokemonCard("setb-2", "2")],
        ),
        { status: 200 },
      )
    })
    try {
      const t = convexTest(schema, modules)
      const actor = t.withIdentity({ subject: "pokemon-printing-importer" })

      const result = await actor.action(api.deckImports.resolvePasted, {
        game: "pokemon",
        list: "1 Pikachu SVA 1\n1 Pikachu SVB 2",
      })

      expect(result.cards).toMatchObject([
        { name: "Pikachu", quantity: 1, originalReference: "Pikachu SVA 1", printingId: "seta-1" },
        { name: "Pikachu", quantity: 1, originalReference: "Pikachu SVB 2", printingId: "setb-2" },
      ])
      expect(fetchSpy).toHaveBeenCalledTimes(4)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it.each([
    ["empty_deck_list", ""],
    [
      "deck_too_large",
      Array.from({ length: 301 }, (_, index) => `1 Card ${index} SET ${index}`).join("\n"),
    ],
  ])("does not report %s validation as provider downtime", async (code, list) => {
    const fetchSpy = jest.spyOn(globalThis, "fetch")
    try {
      const t = convexTest(schema, modules)
      const actor = t.withIdentity({ subject: `validation-${code}` })

      await expect(
        actor.action(api.deckImports.resolvePasted, { game: "pokemon", list }),
      ).rejects.toMatchObject({ data: { code } })
      await expect(
        actor.query(api.providerHealth.current, {
          game: "pokemon",
          provider: "tcgdex",
          operation: "deck-resolution",
        }),
      ).resolves.toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})

describe("preconstructed catalog caching", () => {
  it("fetches the official deck list once and serves later searches from the cache", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(deckListResponse)
    try {
      const t = convexTest(schema, modules)
      const actor = t.withIdentity({ subject: "precon-searcher" })
      const first = await actor.action(api.deckImports.searchPreconstructed, { query: "atraxa" })
      const second = await actor.action(api.deckImports.searchPreconstructed, { query: "atraxa" })
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(first).toMatchObject([{ fileName: "AtraxaInfect", name: "Atraxa Infect" }])
      expect(second).toEqual(first)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("shares a resolved deck across users without repeating external requests", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation((input) => resolvedPreconResponse(String(input)))
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    try {
      const t = convexTest(schema, modules)
      const firstUser = t.withIdentity({ subject: "first-precon-user" })
      const secondUser = t.withIdentity({ subject: "second-precon-user" })

      const first = await firstUser.action(api.deckImports.resolvePreconstructed, {
        fileName: "AvengersAssemble",
      })
      nowSpy.mockReturnValue(1_000_000 + 60 * 60 * 1000)
      const second = await secondUser.action(api.deckImports.resolvePreconstructed, {
        fileName: "AvengersAssemble.json",
      })

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(first).toEqual(second)
      expect(second).toMatchObject({
        name: "Avengers Assemble",
        cards: [{ name: "Captain America, Team Leader", board: "commander", quantity: 1 }],
      })
    } finally {
      nowSpy.mockRestore()
      fetchSpy.mockRestore()
    }
  })

  it("reuses the MTGJSON outline when hydrating a cold preview", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation((input) => resolvedPreconResponse(String(input)))
    try {
      const t = convexTest(schema, modules)
      const actor = t.withIdentity({ subject: "progressive-precon-user" })

      const outline = await actor.action(api.deckImports.previewPreconstructed, {
        fileName: "AvengersAssemble",
      })
      expect(outline).toMatchObject({
        name: "Avengers Assemble",
        cards: [{ name: "Captain America, Team Leader", board: "commander", quantity: 1 }],
      })
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      await actor.action(api.deckImports.resolvePreconstructed, {
        fileName: "AvengersAssemble",
      })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("coalesces concurrent cold outline requests", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation((input) => resolvedPreconResponse(String(input)))
    try {
      const t = convexTest(schema, modules)
      const users = Array.from({ length: 5 }, (_, index) =>
        t.withIdentity({ subject: `concurrent-outline-user-${index}` }),
      )

      const outlines = await Promise.all(
        users.map((user) =>
          user.action(api.deckImports.previewPreconstructed, {
            fileName: "AvengersAssemble",
          }),
        ),
      )

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(outlines.every((outline) => outline.name === "Avengers Assemble")).toBe(true)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("keeps the hydration lease visible after the outline is ready", async () => {
    const t = convexTest(schema, modules)
    const fileName = "HydratingDeck.json"
    await expect(
      t.mutation(internal.deckImports.claimColdPreconstructedFetch, {
        fileName,
        claimId: "hydrating-owner",
      }),
    ).resolves.toBe(true)
    await t.mutation(internal.deckImports.storePreconstructedOutline, {
      fileName,
      name: "Hydrating Deck",
      cards: [],
    })

    await expect(
      t.query(internal.deckImports.coldPreconstructedFetchStatus, { fileName }),
    ).resolves.toMatchObject({
      cached: null,
      outline: { name: "Hydrating Deck" },
      leaseUntil: expect.any(Number),
    })
  })

  it("coalesces concurrent cold requests for the same deck", async () => {
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation((input) => resolvedPreconResponse(String(input)))
    try {
      const t = convexTest(schema, modules)
      const users = Array.from({ length: 5 }, (_, index) =>
        t.withIdentity({ subject: `concurrent-precon-user-${index}` }),
      )

      const results = await Promise.all(
        users.map((user) =>
          user.action(api.deckImports.resolvePreconstructed, {
            fileName: "AvengersAssemble",
          }),
        ),
      )

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(results.every((result) => result.name === "Avengers Assemble")).toBe(true)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("releases a cold-fetch lease when the owner fails", async () => {
    let shouldFail = true
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation((input) => {
      if (shouldFail) {
        shouldFail = false
        return Promise.resolve({ ok: false, status: 503 } as Response)
      }
      return resolvedPreconResponse(String(input))
    })
    try {
      const t = convexTest(schema, modules)
      const actor = t.withIdentity({ subject: "recovering-precon-user" })

      await expect(
        actor.action(api.deckImports.resolvePreconstructed, {
          fileName: "AvengersAssemble",
        }),
      ).rejects.toBeDefined()
      await expect(
        actor.action(api.deckImports.resolvePreconstructed, {
          fileName: "AvengersAssemble",
        }),
      ).resolves.toMatchObject({ name: "Avengers Assemble" })
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("does not let an expired owner release a newer cold-fetch lease", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    try {
      const t = convexTest(schema, modules)
      const fileName = "LeaseOwnership.json"
      await expect(
        t.mutation(internal.deckImports.claimColdPreconstructedFetch, {
          fileName,
          claimId: "first-owner",
        }),
      ).resolves.toBe(true)

      nowSpy.mockReturnValue(1_000_000 + 15_001)
      await expect(
        t.mutation(internal.deckImports.claimColdPreconstructedFetch, {
          fileName,
          claimId: "second-owner",
        }),
      ).resolves.toBe(true)
      await t.mutation(internal.deckImports.releaseColdPreconstructedFetch, {
        fileName,
        claimId: "first-owner",
      })

      await expect(
        t.mutation(internal.deckImports.claimColdPreconstructedFetch, {
          fileName,
          claimId: "third-owner",
        }),
      ).resolves.toBe(false)
    } finally {
      nowSpy.mockRestore()
    }
  })

  it("serves stale data immediately while one background refresh updates the cache", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    let deckName = "Avengers Assemble"
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementation((input) => resolvedPreconResponse(String(input), deckName))
    try {
      const t = convexTest(schema, modules)
      const actor = t.withIdentity({ subject: "stale-precon-user" })
      const first = await actor.action(api.deckImports.resolvePreconstructed, {
        fileName: "AvengersAssemble",
      })
      expect(first.name).toBe("Avengers Assemble")

      deckName = "Avengers Assemble Updated"
      nowSpy.mockReturnValue(1_000_000 + 24 * 60 * 60 * 1000 + 1)
      const stale = await actor.action(api.deckImports.resolvePreconstructed, {
        fileName: "AvengersAssemble",
      })
      const sameStale = await t
        .withIdentity({ subject: "second-stale-precon-user" })
        .action(api.deckImports.resolvePreconstructed, { fileName: "AvengersAssemble" })
      expect(stale.name).toBe("Avengers Assemble")
      expect(sameStale).toEqual(stale)
      expect(fetchSpy).toHaveBeenCalledTimes(2)

      const claimId = await t.run(async (ctx) => {
        const scheduled = await ctx.db.system.query("_scheduled_functions").collect()
        expect(scheduled).toHaveLength(1)
        await ctx.scheduler.cancel(scheduled[0]._id)
        return (scheduled[0].args[0] as { claimId: string }).claimId
      })
      await t.action(internal.deckImports.refreshResolvedPreconstructed, {
        fileName: "AvengersAssemble.json",
        claimId,
      })
      expect(fetchSpy).toHaveBeenCalledTimes(4)
      const refreshed = await actor.action(api.deckImports.resolvePreconstructed, {
        fileName: "AvengersAssemble",
      })
      expect(refreshed.name).toBe("Avengers Assemble Updated")
      expect(fetchSpy).toHaveBeenCalledTimes(4)
    } finally {
      nowSpy.mockRestore()
      fetchSpy.mockRestore()
    }
  })

  it("releases a stale-refresh lease after a failed refresh", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockResolvedValue({ ok: false, status: 503 } as Response)
    try {
      const t = convexTest(schema, modules)
      await t.mutation(internal.deckImports.storeResolvedPreconstructed, {
        fileName: "RetryRefresh.json",
        name: "Retry Refresh",
        cards: [],
        unresolved: [],
      })
      nowSpy.mockReturnValue(1_000_000 + 24 * 60 * 60 * 1000 + 1)

      await expect(
        t.mutation(internal.deckImports.claimResolvedPreconstructedRefresh, {
          fileName: "RetryRefresh.json",
          claimId: "claim-a",
        }),
      ).resolves.toBe(true)
      await expect(
        t.action(internal.deckImports.refreshResolvedPreconstructed, {
          fileName: "RetryRefresh.json",
          claimId: "claim-a",
        }),
      ).rejects.toBeDefined()
      await expect(
        t.mutation(internal.deckImports.claimResolvedPreconstructedRefresh, {
          fileName: "RetryRefresh.json",
          claimId: "claim-b",
        }),
      ).resolves.toBe(true)
    } finally {
      nowSpy.mockRestore()
      fetchSpy.mockRestore()
    }
  })

  it("does not let an expired refresh release a newer refresh lease", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    try {
      const t = convexTest(schema, modules)
      await t.mutation(internal.deckImports.storeResolvedPreconstructed, {
        fileName: "LeaseOwner.json",
        name: "Lease Owner",
        cards: [],
        unresolved: [],
      })

      await expect(
        t.mutation(internal.deckImports.claimResolvedPreconstructedRefresh, {
          fileName: "LeaseOwner.json",
          claimId: "refresh-a",
        }),
      ).resolves.toBe(true)
      nowSpy.mockReturnValue(1_000_000 + REFRESH_LEASE_MS + 1)

      await expect(
        t.mutation(internal.deckImports.claimResolvedPreconstructedRefresh, {
          fileName: "LeaseOwner.json",
          claimId: "refresh-b",
        }),
      ).resolves.toBe(true)

      await t.mutation(internal.deckImports.releaseResolvedPreconstructedRefresh, {
        fileName: "LeaseOwner.json",
        claimId: "refresh-a",
      })
      await expect(
        t.mutation(internal.deckImports.claimResolvedPreconstructedRefresh, {
          fileName: "LeaseOwner.json",
          claimId: "refresh-c",
        }),
      ).resolves.toBe(false)

      await t.mutation(internal.deckImports.releaseResolvedPreconstructedRefresh, {
        fileName: "LeaseOwner.json",
        claimId: "refresh-b",
      })
      await expect(
        t.mutation(internal.deckImports.claimResolvedPreconstructedRefresh, {
          fileName: "LeaseOwner.json",
          claimId: "refresh-d",
        }),
      ).resolves.toBe(true)
    } finally {
      nowSpy.mockRestore()
    }
  })

  it("prunes resolved decks that have gone unused for three months", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    try {
      const t = convexTest(schema, modules)
      await t.mutation(internal.deckImports.storeResolvedPreconstructed, {
        fileName: "OldDeck.json",
        name: "Old Deck",
        cards: [],
        unresolved: [],
      })
      nowSpy.mockReturnValue(1_000_000 + 91 * 24 * 60 * 60 * 1000)
      await t.mutation(internal.deckImports.storeResolvedPreconstructed, {
        fileName: "RecentDeck.json",
        name: "Recent Deck",
        cards: [],
        unresolved: [],
      })

      await expect(
        t.mutation(internal.deckImports.pruneResolvedPreconstructedCache, {}),
      ).resolves.toBe(1)
      await expect(
        t.query(internal.deckImports.resolvedPreconstructedCache, {
          fileName: "OldDeck.json",
        }),
      ).resolves.toBeNull()
      await expect(
        t.query(internal.deckImports.resolvedPreconstructedCache, {
          fileName: "RecentDeck.json",
        }),
      ).resolves.toMatchObject({ name: "Recent Deck" })
    } finally {
      nowSpy.mockRestore()
    }
  })

  it("stores the maximum supported number of compact card entries", async () => {
    const t = convexTest(schema, modules)
    const cards = Array.from({ length: 300 }, (_, index) => ({
      oracleId: `oracle-${index}`,
      scryfallId: `scryfall-${index}`,
      name: `Representative card ${index}`,
      imageUrl: `https://cards.scryfall.io/normal/front/${index}/card-${index}.jpg`,
      smallImageUrl: `https://cards.scryfall.io/small/front/${index}/card-${index}.jpg`,
      quantity: 1,
      board: "main" as const,
    }))

    await expect(
      t.mutation(internal.deckImports.storeResolvedPreconstructed, {
        fileName: "MaximumDeck.json",
        name: "Maximum Deck",
        cards,
        unresolved: [],
      }),
    ).resolves.toBeDefined()
    await expect(
      t.query(internal.deckImports.resolvedPreconstructedCache, {
        fileName: "MaximumDeck.json",
      }),
    ).resolves.toMatchObject({ cards })
  })
})

describe("Scryfall request pacing", () => {
  it("allocates a unique persistent slot to every concurrent reservation", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    try {
      const t = convexTest(schema, modules)
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
    } finally {
      nowSpy.mockRestore()
    }
  })

  it("preserves the full cooldown after an external 429", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    try {
      const t = convexTest(schema, modules)
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
    } finally {
      nowSpy.mockRestore()
    }
  })

  it("spaces collection requests across users by at least 500 ms", async () => {
    const requestTimes: number[] = []
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (_input, options) => {
      requestTimes.push(performance.now())
      const body = JSON.parse(String(options?.body)) as { identifiers: Array<{ name: string }> }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: body.identifiers.map(({ name }, index) => ({
            id: `${String(requestTimes.length).padStart(8, "0")}-0000-0000-0000-${String(index).padStart(12, "0")}`,
            name,
          })),
          not_found: [],
        }),
      } as Response
    })
    try {
      const t = convexTest(schema, modules)
      const firstUser = t.withIdentity({ subject: "first-paced-importer" })
      const secondUser = t.withIdentity({ subject: "second-paced-importer" })

      await Promise.all([
        firstUser.action(api.deckImports.resolvePasted, { list: "1 First Card" }),
        secondUser.action(api.deckImports.resolvePasted, { list: "1 Second Card" }),
      ])

      expect(requestTimes).toHaveLength(2)
      expect(requestTimes[1] - requestTimes[0]).toBeGreaterThanOrEqual(490)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
