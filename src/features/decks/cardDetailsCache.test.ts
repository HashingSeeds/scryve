import { storage } from "@/utils/storage"

import {
  completeCardDetails,
  fetchCardDetails,
  loadCardDetails,
  prefetchCardDetails,
  readCardDetail,
  saveCardDetails,
  type CardDetailStore,
} from "./cardDetailsCache"

const mockPrefetch = jest.fn(async (_urls: string | string[], _cachePolicy?: string) => true)
jest.mock("expo-image", () => ({
  Image: {
    prefetch: (urls: string | string[], cachePolicy?: string) => mockPrefetch(urls, cachePolicy),
  },
}))

function memoryStore(values = new Map<string, string>()): CardDetailStore {
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

const DETAILS_KEY = "scryve.cards.details.v1"
const solRing = { oracleText: "{T}: Add {C}{C}.", typeLine: "Artifact" }

describe("card details cache", () => {
  beforeEach(() => mockPrefetch.mockClear())

  it("round-trips warmed details and ignores corrupt payloads", () => {
    const store = memoryStore()
    expect(loadCardDetails(store)).toEqual({})
    saveCardDetails({ ring: solRing }, store)
    expect(readCardDetail("ring", store)).toEqual(solRing)
    expect(readCardDetail("missing", store)).toBeUndefined()
    expect(loadCardDetails(memoryStore(new Map([[DETAILS_KEY, "not-json{"]])))).toEqual({})
    const mixed = JSON.stringify({ bad: 42, ring: solRing })
    expect(loadCardDetails(memoryStore(new Map([[DETAILS_KEY, mixed]])))).toEqual({ ring: solRing })
  })

  it("keeps details saved by earlier versions and persists new ones for the next session", () => {
    const values = new Map([[DETAILS_KEY, JSON.stringify({ ring: solRing })]])
    const store = memoryStore(values)
    saveCardDetails({ bolt: { typeLine: "Instant" } }, store)
    saveCardDetails({ island: { typeLine: "Land" } }, store)
    expect(loadCardDetails(store)).toEqual({
      ring: solRing,
      bolt: { typeLine: "Instant" },
      island: { typeLine: "Land" },
    })
    expect(loadCardDetails(memoryStore(values))).toEqual(loadCardDetails(store))
  })

  it("reparses after MMKV is wiped outside the cache", () => {
    saveCardDetails({ ring: solRing })
    storage.clearAll()
    expect(loadCardDetails()).toEqual({})
  })

  it("evicts the least recently saved details past 1,500 entries", () => {
    const store = memoryStore()
    saveCardDetails(
      Object.fromEntries(Array.from({ length: 1500 }, (_, i) => [`card-${i}`, solRing])),
      store,
    )
    saveCardDetails({ "card-0": solRing }, store)
    saveCardDetails({ fresh: solRing }, store)
    const keys = Object.keys(loadCardDetails(store))
    expect(keys).toHaveLength(1500)
    expect(keys).toContain("card-0")
    expect(keys).toContain("fresh")
    expect(keys).not.toContain("card-1")
  })

  it("warms uncached version cards with one batch and prefetches images to disk", async () => {
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
    expect(mockPrefetch).toHaveBeenCalledWith(
      ["https://cards.scryfall.io/normal/ring.jpg", "https://cards.scryfall.io/small/ring.jpg"],
      "disk",
    )

    await prefetchCardDetails(
      { query },
      { game: "mtg", versionId: "version-1", revision: 2, cards },
      store,
    )
    expect(query).toHaveBeenCalledTimes(1)
  })

  it("warms both faces and their images for offline detail viewing", async () => {
    const store = memoryStore()
    const faceDetails = JSON.stringify([
      { name: "Front", imageUrl: "https://cards/front.jpg" },
      { name: "Back", imageUrl: "https://cards/back.jpg" },
    ])
    const query = jest.fn(async () => [
      { key: "double-id", details: { imageUrl: "https://cards/front.jpg", faceDetails } },
    ])
    await prefetchCardDetails(
      { query },
      {
        game: "mtg",
        versionId: "double-version",
        revision: 1,
        cards: [{ name: "Front // Back", quantity: 1, scryfallId: "double-id" }],
      },
      store,
    )
    expect(readCardDetail("double-id", store)?.faceDetails).toBe(faceDetails)
    expect(mockPrefetch).toHaveBeenCalledWith(
      ["https://cards/front.jpg", "https://cards/back.jpg"],
      "disk",
    )
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

  it("refetches cached cards saved before facets for games whose deck rules read them", async () => {
    const store = memoryStore()
    const poro = { name: "Pouty Poro", quantity: 3, cardId: "pouty-poro" }
    const ring = { name: "Sol Ring", quantity: 1, scryfallId: "ring-id" }
    saveCardDetails({ "riftbound:pouty-poro:": { typeLine: "Unit" }, "ring-id": solRing }, store)
    const facets = JSON.stringify([{ key: "domains", value: "Fury" }])
    const query = jest.fn(async () => [{ key: "riftbound:pouty-poro:", details: { facets } }])

    await fetchCardDetails({ query }, "riftbound", [poro], store)
    await fetchCardDetails({ query }, "riftbound", [poro], store)
    await fetchCardDetails({ query }, "mtg", [ring], store)

    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(expect.anything(), {
      game: "riftbound",
      items: [{ key: "riftbound:pouty-poro:", catalogCardId: "pouty-poro" }],
    })
    expect(readCardDetail("riftbound:pouty-poro:", store)?.facets).toBe(facets)
  })

  it("refetches Magic details saved from the device's card file, which lack rules text", async () => {
    const store = memoryStore()
    const ring = { name: "Sol Ring", quantity: 1, scryfallId: "ring-id" }
    const full = { ...solRing, commanderEligibility: "ineligible", commanderRulesUpdatedAt: "now" }
    saveCardDetails(
      { "ring-id": { typeLine: "Artifact", commanderEligibility: "ineligible" } },
      store,
    )
    const query = jest.fn(async () => [{ key: "ring-id", details: full }])

    await fetchCardDetails({ query }, "mtg", [ring], store)
    await fetchCardDetails({ query }, "mtg", [ring], store)

    expect(query).toHaveBeenCalledTimes(1)
    expect(readCardDetail("ring-id", store)?.oracleText).toBe(solRing.oracleText)
  })

  it("waits for a card's details still loading instead of asking the server", async () => {
    const store = memoryStore()
    const ring = { name: "Sol Ring", quantity: 1, scryfallId: "ring-id" }
    let finish = (_details: typeof solRing) => {}
    const loading = completeCardDetails(
      "ring-id",
      () => new Promise((resolve) => (finish = resolve)),
      store,
    )
    const query = jest.fn(async () => [])
    const fetched = fetchCardDetails({ query }, "mtg", [ring], store)
    finish(solRing)
    await Promise.all([loading, fetched])

    expect(query).not.toHaveBeenCalled()
    expect(readCardDetail("ring-id", store)).toEqual(solRing)
  })

  it("shares one load per card, and looks the card up again when that load fails", async () => {
    const store = memoryStore()
    const ring = { name: "Sol Ring", quantity: 1, scryfallId: "ring-id" }
    const full = { ...solRing, commanderEligibility: "ineligible", commanderRulesUpdatedAt: "now" }
    saveCardDetails(
      { "ring-id": { typeLine: "Artifact", commanderEligibility: "ineligible" } },
      store,
    )
    let fail = () => {}
    const loading = completeCardDetails(
      "ring-id",
      () => new Promise((_, reject) => (fail = () => reject(new Error("offline")))),
      store,
    )
    expect(completeCardDetails("ring-id", () => Promise.resolve(full), store)).toBe(loading)
    const query = jest.fn(async () => [{ key: "ring-id", details: full }])
    const fetched = fetchCardDetails({ query }, "mtg", [ring], store)
    fail()

    await expect(loading).rejects.toThrow("offline")
    await fetched
    expect(query).toHaveBeenCalledTimes(1)
    expect(readCardDetail("ring-id", store)?.oracleText).toBe(solRing.oracleText)
  })

  it("refetches Lorcana text cached with its printed line wraps", async () => {
    const store = memoryStore()
    const hook = { name: "Fish Hook", quantity: 1, cardId: "fish-hook" }
    const necklace = { name: "Ursula's Shell Necklace", quantity: 1, cardId: "necklace" }
    const dodo = { name: "The Dodo", quantity: 1, cardId: "dodo" }
    const tamatoa = { name: "Tamatoa", quantity: 1, cardId: "tamatoa" }
    saveCardDetails(
      {
        "lorcana:fish-hook:": { oracleText: "Gets +3 ¤ until the start of your next\nturn." },
        "lorcana:necklace:": {
          oracleText: "NOW, SING! Whenever you play a song, you may pay\n1 ⬡ to draw a card.",
        },
        "lorcana:dodo:": {
          oracleText: "EXTRAORDINARY SITUATION This character gets\n+1 ¤ for each 1 damage on him.",
        },
        "lorcana:tamatoa:": {
          oracleText: "Shift 4\nGRABBY When you play this character, draw a card.",
        },
      },
      store,
    )
    const query = jest.fn(async () => [
      {
        key: "lorcana:fish-hook:",
        details: { oracleText: "Gets +3 ¤ until the start of your next turn." },
      },
      {
        key: "lorcana:necklace:",
        details: {
          oracleText: "NOW, SING! Whenever you play a song, you may pay 1 ⬡ to draw a card.",
        },
      },
      {
        key: "lorcana:dodo:",
        details: {
          oracleText: "EXTRAORDINARY SITUATION This character gets +1 ¤ for each 1 damage on him.",
        },
      },
    ])

    await fetchCardDetails({ query }, "lorcana", [hook, necklace, dodo, tamatoa], store)
    await fetchCardDetails({ query }, "lorcana", [hook, necklace, dodo, tamatoa], store)

    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(expect.anything(), {
      game: "lorcana",
      items: [
        { key: "lorcana:fish-hook:", catalogCardId: "fish-hook" },
        { key: "lorcana:necklace:", catalogCardId: "necklace" },
        { key: "lorcana:dodo:", catalogCardId: "dodo" },
      ],
    })
  })
})
