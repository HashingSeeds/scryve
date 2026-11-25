import { storage } from "@/utils/storage"

import { cardKvStorage } from "./cardStorage"
import { localCardDb, resetLocalCardDbConnection } from "./localDb"

describe("local SQLite card database", () => {
  beforeEach(() => {
    storage.clearAll()
    localCardDb.clearAll()
  })

  it("migrates legacy MMKV keys lazily into kv_entries and removes the MMKV copy", () => {
    storage.set("scryve.decks.syncShelf.v1.owner-1", '{"schemaVersion":1,"decks":[]}')
    expect(cardKvStorage.getString("scryve.decks.syncShelf.v1.owner-1")).toBe(
      '{"schemaVersion":1,"decks":[]}',
    )
    expect(storage.getString("scryve.decks.syncShelf.v1.owner-1")).toBeUndefined()
    expect(localCardDb.getKv("scryve.decks.syncShelf.v1.owner-1")).toBe(
      '{"schemaVersion":1,"decks":[]}',
    )
    expect(cardKvStorage.getAllKeys()).toContain("scryve.decks.syncShelf.v1.owner-1")
  })

  it("persists guest decks per row while keeping insertion order on updates", () => {
    localCardDb.upsertGuestDeck("d1", "k1", 10, '{"name":"First"}')
    localCardDb.upsertGuestDeck("d2", "k2", 20, '{"name":"Second"}')
    localCardDb.upsertGuestDeck("d1", "k1", 30, '{"name":"First Updated"}')

    expect(localCardDb.listGuestDecks()).toEqual([
      { localId: "d1", payload: '{"name":"First Updated"}' },
      { localId: "d2", payload: '{"name":"Second"}' },
    ])

    localCardDb.deleteGuestDeck("d1")
    expect(localCardDb.listGuestDecks()).toEqual([{ localId: "d2", payload: '{"name":"Second"}' }])
  })

  it("evicts least recently accessed card details in SQLite past the cap", () => {
    localCardDb.upsertCardDetails(
      [
        { key: "a", payload: '{"typeLine":"Artifact"}', accessedAt: 1 },
        { key: "b", payload: '{"typeLine":"Instant"}', accessedAt: 2 },
        { key: "c", payload: '{"typeLine":"Land"}', accessedAt: 3 },
      ],
      3,
    )
    localCardDb.upsertCardDetails(
      [
        { key: "a", payload: '{"typeLine":"Artifact"}', accessedAt: 4 },
        { key: "d", payload: '{"typeLine":"Creature"}', accessedAt: 5 },
      ],
      3,
    )

    expect(localCardDb.listCardDetails().map((row) => row.key)).toEqual(["c", "a", "d"])
    expect(localCardDb.getCardDetail("b")).toBeUndefined()
  })

  it("rolls back failed transactions without partial writes", () => {
    localCardDb.setKv("existing", "keep")
    expect(() =>
      localCardDb.transaction(() => {
        localCardDb.setKv("existing", "changed")
        localCardDb.setKv("transient", "nope")
        throw new Error("boom")
      }),
    ).toThrow("boom")

    expect(localCardDb.getKv("existing")).toBe("keep")
    expect(localCardDb.getKv("transient")).toBeUndefined()
  })

  it("reopens the database cleanly after resetting the connection", () => {
    localCardDb.setKv("persisted", "value")
    resetLocalCardDbConnection()
    expect(localCardDb.getKv("persisted")).toBe("value")
  })

  it("reads one collection entry by id and hides it once deleted", () => {
    const entry = {
      id: "entry-1",
      game: "mtg",
      cardId: "ora-sol",
      printingId: "cmm-410",
      name: "Sol Ring",
      setCode: "cmm",
      collectorNumber: "410",
      finish: "nonfoil",
      condition: "NM",
      language: "en",
      quantity: 2,
      createdAt: 1,
      updatedAt: 1,
    }
    localCardDb.upsertCollectionEntry(entry)
    expect(localCardDb.getCollectionEntry("entry-1")).toEqual(entry)
    localCardDb.deleteCollectionEntry("entry-1", 2)
    expect(localCardDb.getCollectionEntry("entry-1")).toBeUndefined()
  })
})
