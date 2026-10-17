import { strToU8, zipSync } from "fflate"

import { makeConvexTest } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import lorcanaJson from "./lib/games/fixtures/lorcanaJson.json"
import lorcanaJsonDecks from "./lib/games/fixtures/lorcanaJsonDecks.json"

function decksZip(decks: Record<string, unknown>) {
  return zipSync(
    Object.fromEntries(
      Object.entries(decks).map(([file, deck]) => [file, strToU8(JSON.stringify(deck))]),
    ),
  )
}

async function syncedLorcana(decks: Record<string, unknown> = lorcanaJsonDecks) {
  jest.spyOn(global, "fetch").mockImplementation(async (url) => {
    if (String(url).endsWith("/decks/allDecks.zip")) return new Response(decksZip(decks))
    return new Response(
      JSON.stringify(String(url).endsWith("/metadata.json") ? lorcanaJson.metadata : lorcanaJson),
    )
  })
  const t = makeConvexTest()
  jest.useFakeTimers()
  await t.action(internal.cardDatasetSync.sync, { game: "lorcana" })
  await t.finishAllScheduledFunctions(() => jest.runAllTimers())
  jest.useRealTimers()
  return t
}

describe("Disney Lorcana", () => {
  afterEach(() => jest.restoreAllMocks())

  it("imports a pasted list from the synced LorcanaJSON catalog", async () => {
    const actor = (await syncedLorcana()).withIdentity({ subject: "lorcana-player" })

    const result = await actor.action(api.deckImports.resolvePasted, {
      game: "lorcana",
      list: "4 Hades - King of Olympus\n2x be our guest\n1 Nobody - Anywhere\nnot a card line",
    })

    expect(result.cards).toMatchObject([
      {
        name: "Hades - King of Olympus",
        cardId: "5",
        quantity: 4,
        section: "main",
        imageUrl: expect.stringMatching(/^https:\/\/api\.lorcana\.ravensburger\.com\//),
      },
      { name: "Be Our Guest", quantity: 2 },
      { name: "Nobody - Anywhere", quantity: 1 },
    ])
    expect(result.unresolved).toEqual(["Nobody - Anywhere"])
    expect(result.invalidLines).toEqual(["not a card line"])
  })

  it("serves image fallbacks from the catalog and has no deck links", async () => {
    const actor = (await syncedLorcana()).withIdentity({ subject: "lorcana-player" })

    await expect(
      actor.action(api.cards.imageFallbacks, { game: "lorcana", cardId: "5" }),
    ).resolves.toEqual([
      expect.stringMatching(/\/5_.+\.jpg$/),
      expect.stringMatching(/^https:\/\/api\.lorcana\.ravensburger\.com\//),
    ])
    await expect(
      actor.action(api.deckImports.resolveLink, {
        game: "lorcana",
        url: "https://dreamborn.ink/decks/abc",
      }),
    ).rejects.toMatchObject({ data: { code: "deck_link_unsupported" } })
  })

  it("browses starter decks under each format they are legal in, as synced cards", async () => {
    const t = await syncedLorcana()
    const names = async (format: string) =>
      (
        await t.action(api.deckCatalogs.browse, {
          game: "lorcana",
          format,
          query: "",
          source: "all",
        })
      ).decks.map((deck) => deck.name)

    expect(await names("core")).toEqual(["Core Starter"])
    expect(await names("infinity")).toEqual(["Core Starter", "Rotated Starter"])

    const [rotated] = (
      await t.action(api.deckCatalogs.browse, {
        game: "lorcana",
        format: "infinity",
        query: "rotated",
        source: "all",
      })
    ).decks
    expect(rotated).toMatchObject({ kind: "official", format: "infinity" })
    const detail = await t.query(api.deckCatalogs.detail, { catalogDeckId: rotated._id })
    expect(detail.entries).toMatchObject([
      { cardId: "5", printingId: "5", name: "Hades - King of Olympus", quantity: 2 },
      { cardId: "5", printingId: "205", quantity: 1, imageUrl: expect.stringMatching(/\/205_/) },
      { cardId: "25", name: "Be Our Guest", quantity: 2, category: "Action" },
    ])
    const actor = t.withIdentity({ subject: "lorcana-player" })
    await actor.mutation(api.users.syncCurrent, { displayName: "Lorcana Player" })
    const deckId = await actor.mutation(api.decks.importCatalog, { catalogDeckId: rotated._id })
    await expect(actor.query(api.decks.detail, { deckId })).resolves.toMatchObject({
      deck: { game: "lorcana", format: "infinity", name: "Rotated Starter" },
      cards: expect.arrayContaining([
        expect.objectContaining({ printingId: "205", imageUrl: expect.stringMatching(/\/205_/) }),
      ]),
    })

    const { "deckdata.S12-1.json": _rotatedOut, ...remaining } = lorcanaJsonDecks
    jest.spyOn(global, "fetch").mockImplementation(async () => new Response(decksZip(remaining)))
    const tomorrow = Date.now() + 25 * 60 * 60 * 1000
    jest.spyOn(Date, "now").mockReturnValue(tomorrow)
    await t.action(internal.deckCatalogs.refresh, { game: "lorcana", format: "core" })
    expect(await names("core")).toEqual([])
  })

  it("caches starter decks once the first card sync finishes, before anyone browses", async () => {
    const t = await syncedLorcana()

    const page = await t.query(internal.deckCatalogs.browseCached, {
      game: "lorcana",
      format: "infinity",
      query: "",
      paginationOpts: { numItems: 30, cursor: null },
    })
    expect(page.page.map((deck) => deck.name)).toEqual(["Core Starter", "Rotated Starter"])
  })

  it("keeps a listed starter deck while its cards are missing from a partial sync", async () => {
    const t = await syncedLorcana()
    const coreDecks = async () =>
      (
        await t.action(api.deckCatalogs.browse, {
          game: "lorcana",
          format: "core",
          query: "",
          source: "all",
        })
      ).decks.map((deck) => deck.name)
    expect(await coreDecks()).toEqual(["Core Starter"])

    const coreStarter = lorcanaJsonDecks["deckdata.S12-1.json"]
    const partial = {
      ...lorcanaJsonDecks,
      "deckdata.S12-1.json": { ...coreStarter, cards: [{ amount: 4, id: 9998, isFoil: false }] },
    }
    jest.spyOn(global, "fetch").mockImplementation(async () => new Response(decksZip(partial)))
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 25 * 60 * 60 * 1000)
    await t.action(internal.deckCatalogs.refresh, { game: "lorcana", format: "core" })
    expect(await coreDecks()).toEqual(["Core Starter"])
  })
})
