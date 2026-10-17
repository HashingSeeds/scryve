import { makeConvexTest } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import { normalizeCardName, type BulkDataset, type DatasetCard } from "./lib/games/cards"
import { GAME_PROVIDERS } from "./lib/games/providers"

function datasetCard(index: number): DatasetCard {
  const id = `bulk-${String(index).padStart(3, "0")}`
  const name = index === 7 ? "Lagoon Sprite" : `Bulk Card ${index}`
  return {
    identityNamespace: "ygoprodeck-card",
    cardId: id,
    name,
    nameNormalized: normalizeCardName(name),
    facets: [{ key: "cost", value: String(index % 10) }],
    printings: [
      { provider: "fixture", providerCardId: id, printingId: id, faces: [{ index: 0, name }] },
    ],
  }
}

const datasetCards = Array.from({ length: 150 }, (_, index) => datasetCard(index)).reverse()

function useDataset(version: string) {
  const dataset = {
    version: jest.fn(async () => version),
    load: jest.fn(async () => datasetCards),
  } satisfies BulkDataset
  jest.replaceProperty(GAME_PROVIDERS, "ygo", { ...GAME_PROVIDERS.ygo, catalog: { bulk: dataset } })
  return dataset
}

async function storedCardIds(t: ReturnType<typeof makeConvexTest>) {
  const cards = await t.run(async (ctx) => await ctx.db.query("gameCards").collect())
  return cards.map((card) => card.cardId).sort()
}

describe("bulk card dataset sync", () => {
  afterEach(() => jest.restoreAllMocks())

  it("stores a new version once and serves search and lookup without a provider", async () => {
    const t = makeConvexTest()
    const fetchSpy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("unexpected fetch"))
    const dataset = useDataset("v1")

    await t.action(internal.cardDatasetSync.sync, { game: "ygo" })
    await t.action(internal.cardDatasetSync.sync, { game: "ygo" })

    expect(dataset.load).toHaveBeenCalledTimes(1)
    expect(await storedCardIds(t)).toHaveLength(150)
    await expect(t.query(internal.cardCatalog.datasetSync, { game: "ygo" })).resolves.toEqual(
      expect.objectContaining({ version: "v1" }),
    )
    await expect(
      t.action(api.cards.search, { game: "ygo", query: "Lagoon" }),
    ).resolves.toMatchObject([{ cardId: "bulk-007", name: "Lagoon Sprite" }])
    await expect(t.action(api.cards.search, { game: "ygo", query: "Nowhere" })).resolves.toEqual([])
    await expect(
      t.action(api.cards.byCatalogId, { game: "ygo", cardId: "bulk-149" }),
    ).resolves.toMatchObject({ name: "Bulk Card 149" })
    await expect(
      t.action(api.cards.byCatalogId, { game: "ygo", cardId: "bulk-999" }),
    ).rejects.toMatchObject({ data: { code: "card_not_found" } })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("resumes the current version from its cursor and ignores a batch behind it", async () => {
    const t = makeConvexTest()
    useDataset("v2")
    await t.run(async (ctx) => {
      await ctx.db.insert("cardDatasetSyncs", {
        game: "ygo",
        version: "v1",
        pending: { version: "v2", nextIndex: 100 },
      })
    })

    await t.action(internal.cardDatasetSync.sync, { game: "ygo" })

    const ids = await storedCardIds(t)
    expect(ids).toHaveLength(50)
    expect(ids[0]).toBe("bulk-100")
    await expect(
      t.mutation(internal.cardCatalog.writeDatasetBatch, {
        game: "ygo",
        version: "v2",
        offset: 100,
        total: 150,
        cards: [datasetCard(100)],
      }),
    ).resolves.toBeNull()
    await expect(t.query(internal.cardCatalog.datasetSync, { game: "ygo" })).resolves.toEqual(
      expect.objectContaining({ version: "v2" }),
    )
  })

  it("restarts from the first card when the version changed mid-sync", async () => {
    const t = makeConvexTest()
    useDataset("v3")
    await t.run(async (ctx) => {
      await ctx.db.insert("cardDatasetSyncs", {
        game: "ygo",
        pending: { version: "v2", nextIndex: 100 },
      })
    })

    await t.action(internal.cardDatasetSync.sync, { game: "ygo" })

    expect(await storedCardIds(t)).toHaveLength(150)
  })
})
