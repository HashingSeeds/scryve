import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import { normalizePokemonCards } from "./lib/games/pokemon"
import rushCards from "./lib/games/rushCards.json"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./cards.ts": async () => jest.requireActual("./cards"),
  "./cardCatalog.ts": async () => jest.requireActual("./cardCatalog"),
  "./externalApiRateLimits.ts": async () => jest.requireActual("./externalApiRateLimits"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./providerHealth.ts": async () => jest.requireActual("./providerHealth"),
}

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

const pokemonCard = {
  id: "base1-4",
  localId: "4",
  name: "Charizard",
  category: "Pokemon",
  image: "https://assets.tcgdex.net/en/base/base1/4",
  set: { id: "base1" },
}

describe("card provider caching and health", () => {
  afterEach(() => jest.restoreAllMocks())

  it("serves Rush card text from its own catalog and never sends Rush IDs to YGOPRODeck", async () => {
    const t = convexTest(schema, modules)
    const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("unexpected provider"))
    const card = { ...rushCards[0], game: "ygo" as const }
    await t.mutation(internal.cardCatalog.cacheMany, { cards: [card] })
    const result = await t.action(api.cards.byCatalogId, { game: "ygo", cardId: card.cardId })
    expect(result).toMatchObject({ identityNamespace: "konami-rush", name: card.name })
    expect(result.text).toBeTruthy()
    await expect(
      t.action(api.cards.byCatalogId, { game: "ygo", cardId: "rush:missing" }),
    ).rejects.toMatchObject({
      data: { code: "card_not_found" },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("loads card descriptions without signing in", async () => {
    const id = "11111111-1111-1111-1111-111111111111"
    jest.spyOn(global, "fetch").mockImplementation(() =>
      response({
        id,
        oracle_id: id,
        name: "Avenge",
        type_line: "Sorcery",
        oracle_text: "Destroy all creatures.",
        mana_cost: "{4}{W}{W}",
        image_uris: { normal: "https://cards.scryfall.io/normal/test.jpg" },
      }),
    )
    const t = convexTest(schema, modules)
    await expect(t.action(api.cards.byId, { scryfallId: id })).resolves.toMatchObject({
      name: "Avenge",
      oracleText: "Destroy all creatures.",
    })
  })

  it("upgrades a text-only cache after image access is enabled", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(() => response([pokemonCard]))
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "pokemon-searcher" })

    await t.mutation(internal.integrationManifest.setCapabilityOverride, {
      game: "pokemon",
      capability: "images",
      release: "disabled",
    })
    const textOnly = await actor.action(api.cards.search, {
      game: "pokemon",
      query: "charizard",
    })
    expect(textOnly).toMatchObject([{ name: "Charizard" }])
    expect(textOnly[0]).not.toHaveProperty("imageUrl")
    const cachedTextOnly = await t.query(internal.cardCatalog.searchCached, {
      game: "pokemon",
      query: "charizard",
      limit: 20,
    })
    expect(cachedTextOnly[0]).not.toHaveProperty("imageUrl")

    await t.mutation(internal.integrationManifest.setCapabilityOverride, {
      game: "pokemon",
      capability: "images",
      release: "enabled",
    })
    const withImages = await actor.action(api.cards.search, {
      game: "pokemon",
      query: "charizard",
    })
    expect(withImages[0]).toMatchObject({
      imageUrl: "https://assets.tcgdex.net/en/base/base1/4/high.webp",
    })

    await actor.action(api.cards.search, { game: "pokemon", query: "charizard" })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("records successful empty Pokemon lookups as healthy card-not-found responses", async () => {
    jest.spyOn(global, "fetch").mockImplementation(() => response({}, 404))
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "pokemon-lookup" })

    await expect(
      actor.action(api.cards.byCatalogId, { game: "pokemon", cardId: "missing-card" }),
    ).rejects.toMatchObject({ data: { code: "card_not_found" } })
    await expect(
      actor.query(api.providerHealth.current, {
        game: "pokemon",
        provider: "tcgdex",
        operation: "card-lookup",
      }),
    ).resolves.toMatchObject({ status: "healthy", httpStatus: 404 })
  })

  it("records unmatched Pokemon references as healthy card-not-found responses", async () => {
    const fetchSpy = jest.spyOn(global, "fetch")
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "pokemon-reference-lookup" })

    await expect(
      actor.action(api.cards.byPokemonReference, {
        name: "Charizard",
        originalReference: "not-a-set-reference",
      }),
    ).rejects.toMatchObject({ data: { code: "card_not_found" } })
    expect(fetchSpy).not.toHaveBeenCalled()
    await expect(
      actor.query(api.providerHealth.current, {
        game: "pokemon",
        provider: "tcgdex",
        operation: "card-reference-lookup",
      }),
    ).resolves.toMatchObject({ status: "healthy", httpStatus: 404 })
  })

  it("reports a Pokemon reference search 404 as card-not-found rather than provider failure", async () => {
    jest.spyOn(global, "fetch").mockImplementation(() => response({}, 404))
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "pokemon-reference-404" })
    await expect(
      actor.action(api.cards.byPokemonReference, {
        name: "Riolu",
        originalReference: "MEG 76",
      }),
    ).rejects.toMatchObject({ data: { code: "card_not_found" } })
  })

  it("records successful empty Yu-Gi-Oh lookups as healthy card-not-found responses", async () => {
    jest.spyOn(global, "fetch").mockImplementation(() => response({ data: [] }))
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "ygo-lookup" })

    await expect(
      actor.action(api.cards.byCatalogId, { game: "ygo", cardId: "12345678" }),
    ).rejects.toMatchObject({ data: { code: "card_not_found" } })
    await expect(
      actor.query(api.providerHealth.current, {
        game: "ygo",
        provider: "ygoprodeck",
        operation: "card-lookup",
      }),
    ).resolves.toMatchObject({ status: "healthy", httpStatus: 200 })
  })

  it("still records genuine provider failures as unavailable", async () => {
    jest.spyOn(global, "fetch").mockImplementation(() => response({}, 503))
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "failed-pokemon-lookup" })

    await expect(
      actor.action(api.cards.byCatalogId, { game: "pokemon", cardId: "base1-4" }),
    ).rejects.toMatchObject({ data: { code: "card_provider_unavailable" } })
    await expect(
      actor.query(api.providerHealth.current, {
        game: "pokemon",
        provider: "tcgdex",
        operation: "card-lookup",
      }),
    ).resolves.toMatchObject({ status: "unavailable", httpStatus: 503 })
  })

  it("reports Scryfall 404 lookups as card-not-found", async () => {
    jest.spyOn(global, "fetch").mockImplementation(() => response({}, 404))
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "magic-lookup" })

    await expect(
      actor.action(api.cards.byCatalogId, { game: "mtg", cardId: "missing-card" }),
    ).rejects.toMatchObject({ data: { code: "card_not_found" } })
    await expect(
      actor.action(api.cards.byId, {
        scryfallId: "11111111-1111-1111-1111-111111111111",
      }),
    ).rejects.toMatchObject({ data: { code: "card_not_found" } })
  })
})

describe("image fallback candidates", () => {
  afterEach(() => jest.restoreAllMocks())

  it("finds Magic artwork by oracle identity without changing the stored printing", async () => {
    const id = "11111111-1111-1111-1111-111111111111"
    const fetchSpy = jest
      .spyOn(global, "fetch")
      .mockImplementationOnce(() => response({ oracle_id: id }))
      .mockImplementationOnce(() =>
        response({
          data: [
            {
              id: "other",
              oracle_id: "wrong",
              name: "Wrong card",
              image_uris: { normal: "wrong" },
            },
            {
              id: "alternate",
              oracle_id: id,
              name: "Same card",
              image_uris: { normal: "working" },
            },
          ],
        }),
      )
    const t = convexTest(schema, modules)
    expect(await t.action(api.cards.imageFallbacks, { game: "mtg", cardId: id })).toEqual([
      "working",
    ])
    expect(String(fetchSpy.mock.calls[1][0])).toContain("unique=prints")
    await t.run(async (ctx) => expect(await ctx.db.query("cardPrintings").take(1)).toEqual([]))
  })

  it("uses Yu-Gi-Oh alternate artwork through the existing mirror", async () => {
    jest
      .spyOn(global, "fetch")
      .mockImplementation(() =>
        response({ data: [{ id: 1, name: "Same card", card_images: [{ id: 1 }, { id: 2 }] }] }),
      )
    const t = convexTest(schema, modules)
    expect(await t.action(api.cards.imageFallbacks, { game: "ygo", cardId: "1" })).toEqual([
      "https://ygo-images.scryve.sow.care/images/yugioh/cards/1.jpg",
      "https://ygo-images.scryve.sow.care/images/yugioh/cards/2.jpg",
    ])
  })

  it("matches Pokemon gameplay, rejecting different HP, attack costs, and Pocket cards", async () => {
    const original = {
      id: "me05-039",
      name: "Dhelmise",
      category: "Pokemon",
      hp: 140,
      stage: "Basic",
      types: ["Psychic"],
      attacks: [
        { name: "Vengeful Anchor", cost: ["Psychic"], damage: "30+", effect: "Same rules" },
      ],
    }
    const base = "https://assets.tcgdex.net/en/me/me05/"
    const candidates = [
      { ...original, id: "hp", hp: 90, image: `${base}1` },
      {
        ...original,
        id: "cost",
        attacks: [{ ...original.attacks[0], cost: ["Colorless"] }],
        image: `${base}2`,
      },
      { ...original, id: "pocket", image: "https://assets.tcgdex.net/en/tcgp/A1/1" },
      { ...original, id: "match", image: `${base}091` },
    ]
    const fetchSpy = jest.spyOn(global, "fetch").mockImplementation((input) => {
      const url = String(input)
      if (url.includes("/cards?")) return response(candidates)
      return response(
        url.endsWith(original.id) ? original : candidates.find((card) => url.endsWith(card.id)),
      )
    })
    const t = convexTest(schema, modules)
    expect(
      await t.action(api.cards.imageFallbacks, { game: "pokemon", cardId: original.id }),
    ).toEqual([`${base}091/high.webp`])
    expect(fetchSpy.mock.calls.some(([url]) => String(url).endsWith("/pocket"))).toBe(false)
  })

  it("returns no candidates for bundled Rush cards and rejects invalid identities", async () => {
    const fetchSpy = jest.spyOn(global, "fetch")
    const t = convexTest(schema, modules)
    expect(await t.action(api.cards.imageFallbacks, { game: "ygo", cardId: "rush:15150" })).toEqual(
      [],
    )
    await expect(
      t.action(api.cards.imageFallbacks, { game: "pokemon", cardId: " " }),
    ).rejects.toMatchObject({ data: { code: "invalid_card_identifier" } })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

it("does not fetch fallback images when image access is disabled", async () => {
  const t = convexTest(schema, modules)
  const fetchSpy = jest.spyOn(global, "fetch")
  try {
    await t.mutation(internal.integrationManifest.setCapabilityOverride, {
      game: "pokemon",
      capability: "images",
      release: "disabled",
    })
    await expect(
      t.action(api.cards.imageFallbacks, { game: "pokemon", cardId: "me05-039" }),
    ).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
  }
})

it.each([
  {
    category: "Trainer",
    trainerType: "Item",
    effect: "Put a Pokémon or a Basic Energy card from your discard pile into your hand.",
  },
  { category: "Energy", energyType: "Normal" },
])("upgrades cached Pokemon summaries and preserves full $category details", async (details) => {
  const summary = {
    id: "me02.5-196",
    name: details.category === "Trainer" ? "Night Stretcher" : "Basic Psychic Energy",
    image: "https://assets.tcgdex.net/en/me/me02.5/196",
  }
  const full = { ...summary, ...details }
  const t = convexTest(schema, modules)
  const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(() => response(full))
  try {
    await t.mutation(internal.cardCatalog.cacheMany, { cards: normalizePokemonCards(summary) })
    const args = { game: "pokemon", cardId: summary.id }
    const result = await t.action(api.cards.byCatalogId, args)
    expect(result.typeLabel).toContain(details.category)
    expect(result.text).toBe("effect" in details ? details.effect : undefined)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await t.mutation(internal.cardCatalog.cacheMany, { cards: normalizePokemonCards(summary) })
    const cached = await t.action(api.cards.byCatalogId, args)
    expect(cached.typeLabel).toBe(result.typeLabel)
    expect(cached.text).toBe(result.text)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  } finally {
    fetchSpy.mockRestore()
  }
})

it("caps Pokemon fallback detail requests and prioritizes the original set", async () => {
  const original = {
    id: "me05-039",
    name: "Dhelmise",
    category: "Pokemon",
    hp: 140,
    attacks: [{ name: "Vengeful Anchor" }],
  }
  const candidates = Array.from({ length: 19 }, (_, i) => ({
    id: `older-${i}`,
    name: original.name,
  }))
  candidates.push({ id: "me05-091", name: original.name })
  const calls: string[] = []
  const fetchSpy = jest.spyOn(global, "fetch").mockImplementation((input) => {
    const url = String(input)
    calls.push(url)
    if (url.includes("/cards?")) return response(candidates)
    if (url.endsWith(original.id)) return response(original)
    if (url.endsWith("me05-091"))
      return response({
        ...original,
        id: "me05-091",
        image: "https://assets.tcgdex.net/en/me/me05/091",
      })
    return response({ ...original, hp: 90 })
  })
  try {
    const t = convexTest(schema, modules)
    expect(
      await t.action(api.cards.imageFallbacks, { game: "pokemon", cardId: original.id }),
    ).toEqual(["https://assets.tcgdex.net/en/me/me05/091/high.webp"])
    expect(calls).toHaveLength(10)
    expect(calls[2]).toContain("me05-091")
  } finally {
    fetchSpy.mockRestore()
  }
})
