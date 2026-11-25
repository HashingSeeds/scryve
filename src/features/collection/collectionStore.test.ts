import { localCardDb } from "@/storage/localDb"

import {
  addCollectionCard,
  createBinder,
  deleteBinder,
  listBinders,
  listCollectionEntries,
  moveBinderEntries,
  ownedQuantitiesByCardId,
  updateCollectionEntry,
} from "./collectionStore"

describe("collectionStore", () => {
  beforeEach(() => {
    localCardDb.clearAll()
  })

  it("creates scan sessions and binders, merges duplicate copies, and moves entries", () => {
    const session = createBinder({
      kind: "scan_session",
      name: "Foundations Prerelease",
      game: "mtg",
      defaultSetCode: "FDN",
      now: 100,
    })
    const binder = createBinder({ kind: "binder", name: "Trade Binder", game: "mtg", now: 101 })

    const first = addCollectionCard({
      game: "mtg",
      cardId: "oracle-sol",
      printingId: "fdn-259",
      name: "Sol Ring",
      setCode: "FDN",
      collectorNumber: "259",
      finish: "foil",
      binderId: session.id,
      now: 200,
    })
    const merged = addCollectionCard({
      game: "mtg",
      cardId: "oracle-sol",
      printingId: "fdn-259",
      name: "Sol Ring",
      setCode: "FDN",
      collectorNumber: "259",
      finish: "foil",
      binderId: session.id,
      now: 201,
    })
    expect(merged.id).toBe(first.id)
    expect(merged.quantity).toBe(2)

    const movedCount = moveBinderEntries(session.id, binder.id, 300)
    expect(movedCount).toBe(1)
    expect(listCollectionEntries({ binderId: session.id })).toEqual([])
    expect(listCollectionEntries({ binderId: binder.id })[0].quantity).toBe(2)

    const owned = ownedQuantitiesByCardId("mtg", ["oracle-sol", "missing"])
    expect(owned.get("oracle-sol")).toBe(2)
    expect(owned.get("missing")).toBeUndefined()

    updateCollectionEntry(first.id, { quantity: 0 }, 400)
    expect(listCollectionEntries({ binderId: binder.id })).toEqual([])

    deleteBinder(session.id)
    expect(listBinders("scan_session")).toEqual([])
    expect(listBinders("binder")).toHaveLength(1)
  })
})
