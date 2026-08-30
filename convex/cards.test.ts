import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
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
