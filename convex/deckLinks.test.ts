import { convexTest } from "convex-test"

import { registerRateLimiter } from "../test/registerRateLimiter"
import { api, internal } from "./_generated/api"
import { limitlessDeckLink, limitlessPlayerDecklist } from "./lib/games/limitless"
import { parseYgoprodeckDeckPage, ygoprodeckDeckLink } from "./lib/games/yugiohDecks"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./cardCatalog.ts": async () => jest.requireActual("./cardCatalog"),
  "./deckImports.ts": async () => jest.requireActual("./deckImports"),
  "./externalApiRateLimits.ts": async () => jest.requireActual("./externalApiRateLimits"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./providerHealth.ts": async () => jest.requireActual("./providerHealth"),
  "./users.ts": async () => jest.requireActual("./users"),
}

// eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Documents the origin of the provider fixture rather than behavior.
// Reduced from https://ygoprodeck.com/deck/blue-eyes-for-duelingbook-312866 on October 7, 2026.
function ygoprodeckPage({ deckId = "312866", main = '["89631139","89631139","38517737"]' } = {}) {
  return `<script>
var maindeckjs = '${main}'
var extradeckjs = '["62873545"]'
var sidedeckjs = '["79814787","79814787"]'
var deckname = "Blue-eyes for \\"duelingbook\\""
var deckid = '${deckId}'
</script>`
}

// eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Documents the origin of the provider fixture rather than behavior.
// Reduced from https://play.limitlesstcg.com/api/tournaments/6abbc00b783097f8dcb735dd/standings on October 7, 2026.
const standings = [
  {
    name: "Codycool",
    player: "codycool",
    deck: { id: "lucario-hariyama", name: "Lucario Hariyama" },
    decklist: {
      pokemon: [
        { count: 3, set: "MEG", number: "76", name: "Riolu" },
        { count: 2, set: "MEG", number: 77, name: "Mega Lucario ex" },
      ],
      trainer: [],
      energy: [],
    },
  },
  { name: "No List", player: "nolist", decklist: null },
]

describe("deck link parsing", () => {
  it.each([
    "https://ygoprodeck.com/deck/blue-eyes-for-duelingbook-312866",
    "https://www.ygoprodeck.com/deck/312866/",
  ])("normalizes YGOPRODeck link %s", (url) => {
    expect(ygoprodeckDeckLink(url)).toEqual({
      deckId: "312866",
      sourceUrl: "https://ygoprodeck.com/deck/312866",
    })
  })

  it.each([
    "http://ygoprodeck.com/deck/312866",
    "https://ygoprodeck.com.evil.test/deck/312866",
    "https://ygoprodeck.com/card/?search=312866",
    "https://ygoprodeck.com/deck/blue-eyes",
  ])("rejects non-deck YGOPRODeck URL %s", (url) => {
    expect(() => ygoprodeckDeckLink(url)).toThrow("Enter a public YGOPRODeck deck link.")
  })

  it("normalizes Limitless decklist links and rejects other Limitless pages", () => {
    expect(
      limitlessDeckLink(
        "https://play.limitlesstcg.com/tournament/6abbc00b783097f8dcb735dd/player/codycool",
      ),
    ).toEqual({
      tournamentId: "6abbc00b783097f8dcb735dd",
      player: "codycool",
      sourceUrl:
        "https://play.limitlesstcg.com/tournament/6abbc00b783097f8dcb735dd/player/codycool/decklist",
    })
    expect(() => limitlessDeckLink("https://limitlesstcg.com/decks/list/30007")).toThrow(
      "Enter a Limitless tournament decklist link.",
    )
  })
})

describe("provider payloads", () => {
  it("reads YGOPRODeck's embedded passcodes and deck name", () => {
    expect(parseYgoprodeckDeckPage(ygoprodeckPage(), "312866")).toEqual({
      name: 'Blue-eyes for "duelingbook"',
      sections: {
        main: ["89631139", "89631139", "38517737"],
        extra: ["62873545"],
        side: ["79814787", "79814787"],
      },
    })
  })

  it.each([
    ["another deck's page", ygoprodeckPage({ deckId: "1" })],
    ["a malformed passcode", ygoprodeckPage({ main: '["89631139","Blue-Eyes"]' })],
    ["an empty main deck", ygoprodeckPage({ main: "[]" })],
  ])("rejects a YGOPRODeck page with %s", (_case, html) => {
    expect(() => parseYgoprodeckDeckPage(html, "312866")).toThrow()
  })

  it("picks one Limitless player, reports rows it cannot read, and explains a missing decklist", () => {
    expect(limitlessPlayerDecklist(standings, "CodyCool")).toEqual({
      name: "Lucario Hariyama",
      author: "Codycool",
      entries: [
        expect.objectContaining({ name: "Riolu", quantity: 3, originalReference: "MEG 76" }),
      ],
      invalidLines: ["Mega Lucario ex"],
    })
    expect(() => limitlessPlayerDecklist(standings, "nolist")).toThrow(
      "This player has no public decklist on Limitless.",
    )
    expect(() => limitlessPlayerDecklist(standings, "missing")).toThrow(
      "This player is not in that Limitless tournament.",
    )
  })
})

describe("resolveLink", () => {
  it("imports a YGOPRODeck deck with its sections and copy counts", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.hostname === "ygoprodeck.com") return new Response(ygoprodeckPage())
      const ids = url.searchParams.get("id")?.split(",") ?? []
      return new Response(
        JSON.stringify({
          data: ids.map((id) => ({
            id: Number(id),
            name: `Card ${id}`,
            type: "Effect Monster",
            card_images: [{ id: Number(id) }],
          })),
        }),
      )
    })
    try {
      const t = convexTest(schema, modules)
      registerRateLimiter(t)
      const result = await t
        .withIdentity({ subject: "ygoprodeck-importer" })
        .action(api.deckImports.resolveLink, {
          game: "ygo",
          url: "https://ygoprodeck.com/deck/blue-eyes-for-duelingbook-312866",
        })
      expect(result).toMatchObject({
        sourceName: "YGOPRODeck",
        name: 'Blue-eyes for "duelingbook"',
        sourceUrl: "https://ygoprodeck.com/deck/312866",
        unresolved: [],
      })
      expect(
        result.cards.map((card) => [
          "section" in card ? card.section : undefined,
          card.name,
          card.quantity,
        ]),
      ).toEqual([
        ["main", "Card 89631139", 2],
        ["main", "Card 38517737", 1],
        ["extra", "Card 62873545", 1],
        ["side", "Card 79814787", 2],
      ])
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        "https://ygoprodeck.com/deck/312866",
        expect.objectContaining({ redirect: "error" }),
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("imports one player's Limitless decklist as name, set, and number references", async () => {
    const riolu = { id: "me01-76", localId: "76", name: "Riolu", category: "Pokemon" }
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input))
      if (url.hostname === "play.limitlesstcg.com") return new Response(JSON.stringify(standings))
      return new Response(JSON.stringify(url.pathname.endsWith("/me01-76") ? riolu : [riolu]))
    })
    try {
      const t = convexTest(schema, modules)
      registerRateLimiter(t)
      const result = await t
        .withIdentity({ subject: "limitless-importer" })
        .action(api.deckImports.resolveLink, {
          game: "pokemon",
          url: "https://play.limitlesstcg.com/tournament/6abbc00b783097f8dcb735dd/player/codycool/decklist",
        })
      expect(result).toMatchObject({
        sourceName: "Limitless",
        name: "Lucario Hariyama",
        author: "Codycool",
        unresolved: [],
        invalidLines: ["Mega Lucario ex"],
        cards: [{ name: "Riolu", quantity: 3, originalReference: "Riolu MEG 76" }],
      })
      expect(String(fetchSpy.mock.calls[0][0])).toBe(
        "https://play.limitlesstcg.com/api/tournaments/6abbc00b783097f8dcb735dd/standings",
      )
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("rejects Limitless imports with a retry delay instead of queueing behind a backlog", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch")
    try {
      const t = convexTest(schema, modules)
      registerRateLimiter(t)
      for (let index = 0; index < 10; index++)
        await t.mutation(internal.externalApiRateLimits.reserve, {
          bucket: "limitless:imports",
          intervalMs: 1_000,
        })
      await expect(
        t.withIdentity({ subject: "queued-importer" }).action(api.deckImports.resolveLink, {
          game: "pokemon",
          url: "https://play.limitlesstcg.com/tournament/6abbc00b783097f8dcb735dd/player/codycool",
        }),
      ).rejects.toMatchObject({ data: { code: "rate_limited", retryAfterMs: expect.any(Number) } })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it.each([
    ["ygo", "ygoprodeck", "https://ygoprodeck.com/deck/312866"],
    ["mtg", "archidekt", "https://archidekt.com/decks/200"],
  ])(
    "records a %s deck source outage separately from card resolution",
    async (game, source, url) => {
      const fetchSpy = jest
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("", { status: 503 }))
      try {
        const t = convexTest(schema, modules)
        registerRateLimiter(t)
        await expect(
          t.withIdentity({ subject: "outage-importer" }).action(api.deckImports.resolveLink, {
            game,
            url,
          }),
        ).rejects.toMatchObject({ data: { code: `${source}_unavailable` } })
        await expect(
          t.run(async (ctx) => await ctx.db.query("providerHealth").collect()),
        ).resolves.toMatchObject([
          { game, provider: source, operation: "deck-link", status: "unavailable" },
        ])
      } finally {
        fetchSpy.mockRestore()
      }
    },
  )

  it("rejects another game's deck link before fetching", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch")
    try {
      const t = convexTest(schema, modules)
      registerRateLimiter(t)
      await expect(
        t.action(api.deckImports.resolveLink, {
          game: "ygo",
          url: "https://archidekt.com/decks/200",
        }),
      ).rejects.toMatchObject({ data: { code: "invalid_deck_url" } })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
