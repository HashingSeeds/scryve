import type { ConvexReactClient } from "convex/react"

import { DeckSyncController, DeckSyncRepository, type DeckSyncStorage } from "./decksSync"
import type { Id } from "../../../convex/_generated/dataModel"

class MemoryStorage implements DeckSyncStorage {
  values = new Map<string, string>()

  getString(key: string) {
    return this.values.get(key)
  }

  set(key: string, value: string) {
    this.values.set(key, value)
  }
}

const deckId = "deck-1" as Id<"decks">

const syncedDeck = (revision: number, deleted = false) => ({
  id: "deck-1",
  deckId,
  revision,
  name: `Deck ${revision}`,
  format: "commander",
  game: "mtg",
  note: "",
  deleted,
  createdAt: 1,
  updatedAt: revision,
})

describe("deck sync reads", () => {
  it("rejects a page from a previous account without claiming an empty shelf loaded", async () => {
    const repository = new DeckSyncRepository("owner-b", new MemoryStorage())
    const client = {
      query: jest
        .fn()
        .mockResolvedValue({ ownerId: "owner-a", page: [syncedDeck(1)], isDone: true }),
      watchQuery: () => ({ onUpdate: () => jest.fn() }),
    } as unknown as ConvexReactClient
    const controller = new DeckSyncController(client, repository)
    const stop = controller.start()
    await new Promise(setImmediate)
    expect(controller.getSnapshot()).toMatchObject({ decks: [], unavailable: true })
    expect(repository.loadMetadata()).toEqual([])
    stop()
  })

  it("keeps the last cached shelf after a failed read and sorts newest decks first", async () => {
    const repository = new DeckSyncRepository("owner-a", new MemoryStorage())
    repository.mergeMetadata([
      syncedDeck(1),
      { ...syncedDeck(3), id: "deck-2", deckId: "deck-2" as Id<"decks"> },
    ])
    const client = {
      query: jest.fn().mockRejectedValue(new Error("Offline")),
      watchQuery: () => ({ onUpdate: () => jest.fn() }),
    } as unknown as ConvexReactClient
    const controller = new DeckSyncController(client, repository)
    const stop = controller.start()
    await new Promise(setImmediate)
    expect(controller.getSnapshot().decks.map((deck) => deck._id)).toEqual(["deck-2", "deck-1"])
    expect(controller.getSnapshot().unavailable).toBe(true)
    controller.saveShelf([])
    expect(controller.getSnapshot().unavailable).toBe(true)
    stop()
  })

  it("restores rich shelf data and applies metadata without losing derived fields", () => {
    const storage = new MemoryStorage()
    const repository = new DeckSyncRepository("owner-a", storage)
    repository.saveShelf([
      {
        _id: deckId,
        _creationTime: 1,
        name: "Old name",
        format: "commander",
        game: "mtg",
        createdAt: 1,
        updatedAt: 1,
        ownerUserId: "owner" as Id<"users">,
        latestVersionId: "version-2" as Id<"deckVersions">,
        versionNumber: 2,
        versions: [],
        coverImageUrl: undefined,
        lastPlayedAt: undefined,
        favoritedAt: undefined,
        record: undefined,
        versionCount: 2,
        cardQuantity: 100,
      },
    ])
    repository.mergeMetadata([syncedDeck(2)])

    const controller = new DeckSyncController({} as ConvexReactClient, repository)
    expect(controller.getSnapshot().decks).toMatchObject([
      { _id: "deck-1", name: "Deck 2", versionCount: 2, cardQuantity: 100 },
    ])
  })

  it("keeps the newest revision and its tombstone", () => {
    const repository = new DeckSyncRepository("owner-a", new MemoryStorage())
    repository.mergeMetadata([syncedDeck(3, true)])
    repository.mergeMetadata([syncedDeck(2)])

    const controller = new DeckSyncController({} as ConvexReactClient, repository)
    expect(controller.getSnapshot().metadata).toMatchObject([{ revision: 3, deleted: true }])
    expect(controller.getSnapshot().decks).toEqual([])
  })

  it("subscribes to every fetched page and stops all subscriptions", async () => {
    const unsubscribes = [jest.fn(), jest.fn()]
    const watched: Array<string | null> = []
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          ownerId: "owner-a",
          page: [syncedDeck(1)],
          isDone: false,
          continueCursor: "page-2",
        })
        .mockResolvedValueOnce({
          ownerId: "owner-a",
          page: [],
          isDone: true,
          continueCursor: "done",
        }),
      watchQuery: jest.fn((_reference, args: { paginationOpts: { cursor: string | null } }) => {
        const index = watched.push(args.paginationOpts.cursor) - 1
        return { onUpdate: () => unsubscribes[index] }
      }),
    } as unknown as ConvexReactClient
    const controller = new DeckSyncController(
      client,
      new DeckSyncRepository("owner-a", new MemoryStorage()),
    )

    const stop = controller.start()
    await new Promise(setImmediate)
    expect(watched).toEqual([null, "page-2"])

    stop()
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1)
    expect(unsubscribes[1]).toHaveBeenCalledTimes(1)
  })

  it("handles the first watch update and ignores reads that finish after an owner stops", async () => {
    const storage = new MemoryStorage()
    let changed = () => {}
    let finish: (value: unknown) => void = () => {}
    const client = {
      query: jest
        .fn()
        .mockResolvedValue({ ownerId: "owner-a", page: [syncedDeck(1)], isDone: true }),
      watchQuery: () => ({
        onUpdate: (callback: () => void) => {
          changed = callback
          return jest.fn()
        },
      }),
    }
    const repository = new DeckSyncRepository("owner-a", storage)
    const controller = new DeckSyncController(client as unknown as ConvexReactClient, repository)
    const stop = controller.start()
    await new Promise(setImmediate)
    client.query.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    changed()
    expect(client.query).toHaveBeenCalledTimes(2)
    stop()
    finish({ ownerId: "owner-a", page: [syncedDeck(2, true)], isDone: true })
    await new Promise(setImmediate)
    expect(repository.loadMetadata()).toMatchObject([{ revision: 1, deleted: false }])
    expect(new DeckSyncRepository("owner-b", storage).loadMetadata()).toEqual([])

    const restart = controller.start()
    await new Promise(setImmediate)
    expect(client.query).toHaveBeenCalledTimes(3)
    restart()
  })
})
