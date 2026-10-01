import { convexTest } from "convex-test"

import { registerRateLimiter } from "../test/registerRateLimiter"
import { api } from "./_generated/api"
import { deckRateLimiter } from "./lib/deckRateLimits"
import { archidektDeckLink, parseArchidektDeck } from "./lib/games/archidekt"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./archidektImports.ts": async () => jest.requireActual("./archidektImports"),
  "./externalApiRateLimits.ts": async () => jest.requireActual("./externalApiRateLimits"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./users.ts": async () => jest.requireActual("./users"),
}
const importDeck = api.archidektImports.resolvePublic

function card(
  id: number,
  name: string,
  uid: string,
  oracleId: string,
  categories: string[] | null,
) {
  return {
    id,
    categories,
    quantity: 1,
    deletedAt: null,
    card: { uid, oracleCard: { uid: oracleId, name, types: ["Creature"] } },
  }
}

// eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Documents the origin of the provider fixture rather than behavior.
// Reduced from https://archidekt.com/api/decks/200/ on September 30, 2026.
const publicDeck = {
  id: 200,
  name: "Instant Value Town",
  owner: { username: "Jaimby" },
  private: false,
  unlisted: false,
  deckFormat: 3,
  customCards: [],
  categories: [
    { name: "Commander", isPremier: true, includedInDeck: true },
    { name: "Sideboard", isPremier: false, includedInDeck: true },
    { name: "Maybeboard", isPremier: false, includedInDeck: false },
    { name: "Creature", isPremier: false, includedInDeck: true },
  ],
  cards: [
    card(
      241512,
      "Talrand, Sky Summoner",
      "fea27d0c-92b1-4530-8035-519463722f17",
      "ea1eb902-a23c-44ff-9169-19baf71de238",
      null,
    ),
    card(
      241510,
      "Kess, Dissident Mage",
      "01711ff6-475c-48c4-91f4-438433f88a95",
      "f5092c14-eec4-472c-999c-ba96c36b2fbb",
      ["Commander"],
    ),
    card(
      241520,
      "Dissipation Field",
      "247694c5-5813-4256-9fd8-478d4be52081",
      "35426427-4268-4c8f-9fe1-270f2ce43d97",
      ["Sideboard"],
    ),
    card(
      241517,
      "Comet Storm",
      "48743445-6e2e-4001-b314-365b9a8b091e",
      "9c2b262b-53c0-41a1-8f1a-0c336453d4bf",
      ["Maybeboard"],
    ),
  ],
}

function providerResponse() {
  return new Response(JSON.stringify(publicDeck))
}

it("preserves public deck attribution, exact printings, null categories and boards", () => {
  const result = parseArchidektDeck(publicDeck, "200")
  expect(result).toMatchObject({
    name: "Instant Value Town",
    author: "Jaimby",
    format: "commander",
  })
  expect(result.entries.map(({ name, board }) => ({ name, board }))).toEqual([
    { name: "Talrand, Sky Summoner", board: "main" },
    { name: "Kess, Dissident Mage", board: "commander" },
    { name: "Dissipation Field", board: "sideboard" },
  ])
  expect(result.entries[0].scryfallId).toBe("fea27d0c-92b1-4530-8035-519463722f17")
})

it("uses only the primary category, merges printing rows once, and excludes actual tokens", () => {
  const first = { ...publicDeck.cards[0], categories: ["Creature", "Commander", "Maybeboard"] }
  const token = {
    ...publicDeck.cards[0],
    id: 99,
    card: {
      ...publicDeck.cards[0].card,
      oracleCard: { ...publicDeck.cards[0].card.oracleCard, types: ["Token"] },
    },
  }
  const result = parseArchidektDeck(
    { ...publicDeck, cards: [first, { ...first, id: 98, quantity: 2 }, token] },
    "200",
  )
  expect(result.entries).toHaveLength(1)
  expect(result.entries[0]).toMatchObject({ board: "main", quantity: 3 })
  expect(
    parseArchidektDeck(
      {
        ...publicDeck,
        cards: [{ ...first, categories: ["Maybeboard", "Creature"] }, publicDeck.cards[1]],
      },
      "200",
    ).entries,
  ).toHaveLength(1)
})

it.each([
  { ...publicDeck, private: true },
  { ...publicDeck, unlisted: true },
  { ...publicDeck, deckFormat: 14 },
  { ...publicDeck, cards: [{ ...publicDeck.cards[0], quantity: 0 }] },
  {
    ...publicDeck,
    categories: [{ name: "Signature Spell", isPremier: true, includedInDeck: true }],
    cards: [{ ...publicDeck.cards[0], categories: ["Signature Spell"] }],
  },
  { ...publicDeck, cards: [...publicDeck.cards, publicDeck.cards[0]] },
  { ...publicDeck, cards: Array.from({ length: 301 }, () => publicDeck.cards[0]) },
])("rejects private, oversized, malformed or unsupported decks", (payload) => {
  expect(() => parseArchidektDeck(payload, "200")).toThrow()
})

it.each([
  "http://archidekt.com/decks/200",
  "https://archidekt.com.evil.test/decks/200",
  "https://user@archidekt.com/decks/200",
  "https://archidekt.com:444/decks/200",
  "https://archidekt.com/api/decks/200",
  "https://archidekt.com/decks/200/slug/extra",
  "https://archidekt.com/decks/0",
])("rejects non-provider URLs", (url) => {
  expect(() => archidektDeckLink(url)).toThrow()
})

it("normalizes deck links and uses a fixed fetch path for guests", async () => {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (url) => {
    if (String(url).includes("archidekt.com")) return providerResponse()
    return new Response(
      JSON.stringify({
        data: publicDeck.cards.slice(0, 3).map((row) => ({
          id: row.card.uid,
          oracle_id: row.card.oracleCard.uid,
          name: row.card.oracleCard.name,
        })),
        not_found: [],
      }),
    )
  })
  try {
    const result = await t.action(importDeck, {
      url: "https://www.archidekt.com/decks/200/instant_value_town?foo=bar#cards",
    })
    expect(result).toMatchObject({
      sourceUrl: "https://archidekt.com/decks/200",
      author: "Jaimby",
      unresolved: [],
      invalidLines: [],
    })
    expect(result.cards).toHaveLength(3)
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "https://archidekt.com/api/decks/200/",
      expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
    )
    expect(JSON.parse(String(fetchSpy.mock.calls[1][1]?.body))).toEqual({
      identifiers: publicDeck.cards.slice(0, 3).map((row) => ({ id: row.card.uid })),
    })
    await t.run(async (ctx) => {
      await deckRateLimiter.limit(ctx, "guestDeckImport", { count: 19 })
    })
    await expect(
      t.action(importDeck, { url: "https://archidekt.com/decks/200" }),
    ).rejects.toMatchObject({ data: { code: "rate_limited" } })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  } finally {
    fetchSpy.mockRestore()
  }
})

it("does not substitute another printing or trust mismatched oracle identity", async () => {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (url) =>
    String(url).includes("archidekt.com")
      ? providerResponse()
      : new Response(
          JSON.stringify({
            data: [
              {
                id: publicDeck.cards[0].card.uid,
                oracle_id: publicDeck.cards[1].card.oracleCard.uid,
                name: publicDeck.cards[0].card.oracleCard.name,
              },
            ],
            not_found: [],
          }),
        ),
  )
  try {
    const result = await t.action(importDeck, { url: "https://archidekt.com/decks/200" })
    expect(result.cards).toEqual([])
    expect(result.unresolved).toHaveLength(3)
  } finally {
    fetchSpy.mockRestore()
  }
})

it.each([403, 404, 429, 500])("returns a useful provider failure for HTTP %s", async (status) => {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(new Response("", { status }))
  try {
    await expect(
      t.action(importDeck, { url: "https://archidekt.com/decks/200" }),
    ).rejects.toMatchObject({ data: { code: "archidekt_unavailable" } })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  } finally {
    fetchSpy.mockRestore()
  }
})

it("bounds responses even without a content-length header", async () => {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  const fetchSpy = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response("x".repeat(4 * 1024 * 1024 + 1)))
  try {
    await expect(
      t.action(importDeck, { url: "https://archidekt.com/decks/200" }),
    ).rejects.toMatchObject({ data: { code: "archidekt_invalid_response" } })
  } finally {
    fetchSpy.mockRestore()
  }
})

it("aborts slow Archidekt requests and returns the paste fallback", async () => {
  jest.useFakeTimers()
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  let notifyStarted: () => void = () => {}
  const started = new Promise<void>((resolve) => {
    notifyStarted = resolve
  })
  const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (_url, options) => {
    notifyStarted()
    return await new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("Request aborted")), {
        once: true,
      })
    })
  })
  try {
    const pending = t.action(importDeck, { url: "https://archidekt.com/decks/200" })
    const assertion = expect(pending).rejects.toMatchObject({
      data: { code: "archidekt_unavailable" },
    })
    await started
    await jest.advanceTimersByTimeAsync(10_000)
    await assertion
  } finally {
    fetchSpy.mockRestore()
    jest.useRealTimers()
  }
})
