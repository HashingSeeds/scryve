import {
  loadCardDetails,
  prefetchCardDetails,
  readCardDetail,
  saveCardDetails,
  type CardDetailStore,
} from "./cardDetailsCache"

const mockPrefetch = jest.fn(async (_urls: string | string[]) => true)
jest.mock("expo-image", () => ({
  Image: { prefetch: (urls: string | string[]) => mockPrefetch(urls) },
}))

function memoryStore(): CardDetailStore {
  const values = new Map<string, string>()
  return {
    getString: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value)
    },
    delete: (key) => {
      values.delete(key)
    },
  }
}

const solRing = { oracleText: "{T}: Add {C}{C}.", typeLine: "Artifact" }

describe("card details cache", () => {
  beforeEach(() => mockPrefetch.mockClear())

  it("round-trips warmed details and ignores corrupt payloads", () => {
    const store = memoryStore()
    expect(loadCardDetails(store)).toEqual({})
    saveCardDetails({ ring: solRing }, store)
    expect(readCardDetail("ring", store)).toEqual(solRing)
    expect(readCardDetail("missing", store)).toBeUndefined()
    store.set("scryve.cards.details.v1", "not-json{")
    expect(loadCardDetails(store)).toEqual({})
    store.set("scryve.cards.details.v1", JSON.stringify({ bad: 42, ring: solRing }))
    expect(loadCardDetails(store)).toEqual({ ring: solRing })
  })

  it("warms uncached version cards with one batch and prefetches images", async () => {
    const store = memoryStore()
    const query = jest.fn(async () => [
      {
        key: "ring-id",
        details: {
          ...solRing,
          imageUrl: "https://cards.scryfall.io/normal/ring.jpg",
          smallImageUrl: "https://cards.scryfall.io/small/ring.jpg",
        },
      },
    ])
    const cards = [
      { name: "Sol Ring", quantity: 1, scryfallId: "ring-id" },
      { name: "Nameless", quantity: 1 },
    ]
    await prefetchCardDetails(
      { query },
      { game: "mtg", versionId: "version-1", revision: 2, cards },
      store,
    )
    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(expect.anything(), {
      game: "mtg",
      items: [{ key: "ring-id", scryfallId: "ring-id" }],
    })
    expect(readCardDetail("ring-id", store)).toMatchObject(solRing)
    expect(mockPrefetch).toHaveBeenCalledTimes(1)
    expect(mockPrefetch).toHaveBeenCalledWith([
      "https://cards.scryfall.io/normal/ring.jpg",
      "https://cards.scryfall.io/small/ring.jpg",
    ])

    await prefetchCardDetails(
      { query },
      { game: "mtg", versionId: "version-1", revision: 2, cards },
      store,
    )
    expect(query).toHaveBeenCalledTimes(1)
  })

  it("retries after a failed warm and skips fully warmed versions", async () => {
    const store = memoryStore()
    const query = jest.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([])
    const cards = [{ name: "Sol Ring", quantity: 1, scryfallId: "ring-id" }]
    await prefetchCardDetails(
      { query },
      { game: "mtg", versionId: "version-9", revision: 1, cards },
      store,
    )
    await prefetchCardDetails(
      { query },
      { game: "mtg", versionId: "version-9", revision: 1, cards },
      store,
    )
    expect(query).toHaveBeenCalledTimes(2)
    await prefetchCardDetails(
      { query },
      { game: "mtg", versionId: "version-9", revision: 1, cards },
      store,
    )
    expect(query).toHaveBeenCalledTimes(2)
  })
})
