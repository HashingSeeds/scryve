import { makeConvexTest } from "../test/convexTest"
import { internal } from "./_generated/api"
import { normalizePokemonCards } from "./lib/games/pokemon"
import { pokemonCardFromCatalog } from "./lib/table"

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
    const t = makeConvexTest()
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
    const t = makeConvexTest()
    await t.mutation(internal.cardCatalog.cacheMany, {
      cards: [card(Array.from({ length: 101 }, (_, index) => printing(index)))],
    })

    await expect(
      t.run(async (ctx) => await ctx.db.query("cardPrintings").collect()),
    ).resolves.toHaveLength(100)
  })

  it("keeps a full TCGdex card's HP when a brief search result for it is cached", async () => {
    const t = makeConvexTest()
    const [full] = normalizePokemonCards({
      id: "sv03.5-006",
      localId: "006",
      name: "Charizard ex",
      category: "Pokemon",
      hp: 330,
      stage: "Stage2",
    })
    const [brief] = normalizePokemonCards({
      id: "sv03.5-006",
      localId: "006",
      name: "Charizard ex",
    })
    await t.mutation(internal.cardCatalog.cacheMany, { cards: [full] })
    await t.mutation(internal.cardCatalog.cacheMany, { cards: [brief] })

    const cached = await t.query(internal.cardCatalog.lookupCached, {
      game: "pokemon",
      cardId: "sv03.5-006",
    })
    expect(cached).toMatchObject({ category: "Pokemon" })
    expect(cached && pokemonCardFromCatalog(cached)).toEqual({
      cardId: "sv03.5-006",
      name: "Charizard ex",
      hp: 330,
      prizes: 2,
    })
  })

  it("rejects cards without a printing", async () => {
    const t = makeConvexTest()
    await expect(
      t.mutation(internal.cardCatalog.cacheMany, { cards: [card([])] }),
    ).rejects.toMatchObject({ data: { code: "invalid_card" } })
  })
})
