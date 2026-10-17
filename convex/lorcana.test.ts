import { makeConvexTest } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import lorcanaJson from "./lib/games/fixtures/lorcanaJson.json"

async function syncedLorcana() {
  jest
    .spyOn(global, "fetch")
    .mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).endsWith("/metadata.json") ? lorcanaJson.metadata : lorcanaJson,
          ),
        ),
    )
  const t = makeConvexTest()
  await t.action(internal.cardDatasetSync.sync, { game: "lorcana" })
  return t.withIdentity({ subject: "lorcana-player" })
}

describe("Disney Lorcana", () => {
  afterEach(() => jest.restoreAllMocks())

  it("imports a pasted list from the synced LorcanaJSON catalog", async () => {
    const actor = await syncedLorcana()

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

  it("serves image fallbacks from the catalog and has no deck links or example decks", async () => {
    const actor = await syncedLorcana()

    await expect(
      actor.action(api.cards.imageFallbacks, { game: "lorcana", cardId: "5" }),
    ).resolves.toEqual([
      expect.stringMatching(/\/5_.+\.jpg$/),
      expect.stringMatching(/^https:\/\/api\.lorcana\.ravensburger\.com\//),
    ])
    await expect(
      actor.action(api.deckCatalogs.browse, { game: "lorcana", query: "" }),
    ).resolves.toEqual({ decks: [], cursor: null, status: "unsupported" })
    await expect(
      actor.action(api.deckImports.resolveLink, {
        game: "lorcana",
        url: "https://dreamborn.ink/decks/abc",
      }),
    ).rejects.toMatchObject({ data: { code: "deck_link_unsupported" } })
  })
})
