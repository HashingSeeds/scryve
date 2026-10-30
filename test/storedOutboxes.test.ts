import type { ConvexReactClient } from "convex/react"

import { OutboxSyncController } from "@/features/connected/OutboxSyncController"
import { ConnectedGameRepository } from "@/features/connected/persistence"
import { DeckMetadataWriteController } from "@/features/decks/decksSyncWrites"
import { DeckVersionWriteController } from "@/features/decks/decksVersionWrites"
import { DECK_VERSION_CONFLICT_REASON } from "@/features/decks/deckSyncReasons"
import { asDeviceId } from "@/features/game/domain"
import { ManualMatchController } from "@/features/matches/matchOutbox"

import { projection } from "./fixtures/connectedProjection"
import { MemoryStorage } from "./support/memoryStorage"

jest.mock("@/utils/telemetry", () => ({ emitTelemetry: jest.fn() }))

// why: main's own writers produced these at 2a5c6572 (decks, games) and b0757e9f (matches), copied byte for byte; a hand edit would hide a key or record change.
const STORED_BY_V0_2_1: Record<string, string> = {
  "count.connected.failed.index.v1.6:user-1.11:game-public": '["operation-failed-000001"]',
  "count.connected.failed.record.v1.6:user-1.11:game-public.operation-failed-000001":
    '{"writtenBy":{"app":"0.2.1","update":"embedded","runtime":"unknown"},"schemaVersion":1,"action":{"schemaVersion":1,"event":{"type":"life.changed","operationId":"operation-failed-000001","gameId":"game-public","playerId":"player-1","delta":1,"actorId":"user-1","deviceId":"device-0001","clientCreatedAt":120},"queuedAt":120,"attempts":0},"reason":"Game is not active","failedAt":220}',
  "count.connected.outbox.index.v1.6:user-1.11:game-public": '["operation-pending-00001"]',
  "count.connected.outbox.record.v1.6:user-1.11:game-public.operation-pending-00001":
    '{"writtenBy":{"app":"0.2.1","update":"embedded","runtime":"unknown"},"schemaVersion":1,"event":{"type":"life.changed","operationId":"operation-pending-00001","gameId":"game-public","playerId":"player-1","delta":5,"actorId":"user-1","deviceId":"device-0001","clientCreatedAt":120},"queuedAt":120,"attempts":0}',
  "scryve.decks.failed.v1.https%3A%2F%2Fhappy-otter-123.convex.cloud.owner-1":
    '["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]',
  "scryve.decks.failedRecord.v1.https%3A%2F%2Fhappy-otter-123.convex.cloud.owner-1.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa":
    '{"writtenBy":{"app":"0.2.1","update":"embedded","runtime":"unknown"},"schemaVersion":1,"action":{"schemaVersion":1,"ownerId":"owner-1","deckId":"deck-1","id":"deck-1","operationId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","expectedRevision":3,"name":"Atraxa","format":"commander","game":"mtg","note":"Rejected edit","deleted":false,"queuedAt":100,"attempts":0},"reason":"Deck was deleted","failedAt":200}',
  "scryve.decks.failedVersion.v1.https%3A%2F%2Fhappy-otter-123.convex.cloud.owner-1":
    '["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]',
  "scryve.decks.failedVersionRecord.v1.https%3A%2F%2Fhappy-otter-123.convex.cloud.owner-1.cccccccc-cccc-4ccc-8ccc-cccccccccccc":
    '{"writtenBy":{"app":"0.2.1","update":"embedded","runtime":"unknown"},"schemaVersion":1,"action":{"schemaVersion":1,"ownerId":"owner-1","deckId":"deck-1","versionId":"version-1","operationId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","expectedRevision":5,"cards":[{"name":"Sol Ring","quantity":1,"section":"main"}],"queuedAt":110,"attempts":0},"reason":"Deck version changed on another device","failedAt":210}',
  "scryve.decks.pending.v1.https%3A%2F%2Fhappy-otter-123.convex.cloud.owner-1":
    '["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]',
  "scryve.decks.pendingRecord.v1.https%3A%2F%2Fhappy-otter-123.convex.cloud.owner-1.bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb":
    '{"writtenBy":{"app":"0.2.1","update":"embedded","runtime":"unknown"},"schemaVersion":1,"ownerId":"owner-1","deckId":"deck-1","id":"deck-1","operationId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","expectedRevision":3,"name":"Atraxa","format":"commander","game":"mtg","note":"Offline note","deleted":false,"queuedAt":100,"attempts":0}',
  "scryve.decks.pendingVersion.v1.https%3A%2F%2Fhappy-otter-123.convex.cloud.owner-1":
    '["dddddddd-dddd-4ddd-8ddd-dddddddddddd"]',
  "scryve.decks.pendingVersionRecord.v1.https%3A%2F%2Fhappy-otter-123.convex.cloud.owner-1.dddddddd-dddd-4ddd-8ddd-dddddddddddd":
    '{"writtenBy":{"app":"0.2.1","update":"embedded","runtime":"unknown"},"schemaVersion":1,"ownerId":"owner-1","deckId":"deck-1","versionId":"version-1","operationId":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","expectedRevision":5,"cards":[{"name":"Sol Ring","quantity":2,"section":"main"}],"queuedAt":110,"attempts":0}',
  "scryve.matches.pending.v1.https%3A%2F%2Fhappy-otter-123.convex.cloud.owner-1":
    '["match_offline_0001"]',
  "scryve.matches.pendingRecord.v1.https%3A%2F%2Fhappy-otter-123.convex.cloud.owner-1.match_offline_0001":
    '{"writtenBy":{"app":"0.2.1","update":"embedded","runtime":"unknown"},"schemaVersion":1,"ownerId":"owner-1","args":{"publicId":"match_offline_0001","bestOf":3,"finishedAt":1793336400000,"me":{"seat":1,"outcome":"win"},"opponents":[{"seat":2,"displayName":"Rival","outcome":"loss"}]},"queuedAt":130,"attempts":0}',
}

const deploymentUrl = "https://happy-otter-123.convex.cloud"
const MATCH_RECORD =
  "scryve.matches.pendingRecord.v1.https%3A%2F%2Fhappy-otter-123.convex.cloud.owner-1.match_offline_0001"
const flush = () => new Promise(setImmediate)

function storedV021() {
  const storage = new MemoryStorage()
  for (const [key, value] of Object.entries(STORED_BY_V0_2_1)) storage.set(key, value)
  return storage
}

const keysStartingWith = (storage: MemoryStorage, ...prefixes: string[]) =>
  [...storage.values.keys()].filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))

describe("outboxes stored by v0.2.1", () => {
  it("drain and dismiss deck metadata writes", async () => {
    const storage = storedV021()
    const mutation = jest.fn(async (_reference: unknown, args: { id: string }) => ({
      id: args.id,
      deckId: args.id,
      revision: 4,
      name: "Atraxa",
      format: "commander",
      game: "mtg",
      note: "Offline note",
      deleted: false,
      createdAt: 1,
      updatedAt: 4,
    }))
    const controller = new DeckMetadataWriteController(
      { mutation } as unknown as ConvexReactClient,
      "owner-1",
      { storage, deploymentUrl },
    )

    expect(controller.getSnapshot()).toMatchObject({
      pending: [{ operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", note: "Offline note" }],
      failures: [{ action: { note: "Rejected edit" }, reason: "Deck was deleted" }],
    })
    controller.discardFailure("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    const stop = controller.start()
    await flush()
    stop()

    expect(mutation).toHaveBeenCalledTimes(1)
    expect(mutation.mock.calls[0][1]).toEqual({
      id: "deck-1",
      operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      expectedOwnerId: "owner-1",
      returnConflict: true,
      expectedRevision: 3,
      name: "Atraxa",
      format: "commander",
      game: "mtg",
      note: "Offline note",
      deleted: false,
    })
    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    expect(
      keysStartingWith(storage, "scryve.decks.pendingRecord.", "scryve.decks.failedRecord."),
    ).toEqual([])
  })

  it("drain and dismiss deck version writes", async () => {
    const storage = storedV021()
    const mutation = jest.fn(async () => ({ revision: 6 }))
    const controller = new DeckVersionWriteController(
      { mutation } as unknown as ConvexReactClient,
      "owner-1",
      { storage, deploymentUrl },
    )

    expect(controller.getSnapshot()).toMatchObject({
      pending: [{ operationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", expectedRevision: 5 }],
      failures: [{ reason: DECK_VERSION_CONFLICT_REASON }],
    })
    controller.discardFailure("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
    const stop = controller.start()
    await flush()
    stop()

    expect(mutation.mock.calls).toEqual([
      [
        expect.anything(),
        {
          deckId: "deck-1",
          versionId: "version-1",
          operationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          expectedRevision: 5,
          cards: [{ name: "Sol Ring", quantity: 2, section: "main" }],
          returnConflict: true,
        },
      ],
    ])
    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    expect(
      keysStartingWith(
        storage,
        "scryve.decks.pendingVersionRecord.",
        "scryve.decks.failedVersionRecord.",
      ),
    ).toEqual([])
  })

  it("drain a manual match result", async () => {
    const storage = storedV021()
    const mutation = jest.fn(async () => null)
    const controller = new ManualMatchController(
      { mutation } as unknown as ConvexReactClient,
      "owner-1",
      { storage, deploymentUrl },
    )

    expect(controller.getSnapshot().pending).toMatchObject([
      { args: { publicId: "match_offline_0001", opponents: [{ displayName: "Rival" }] } },
    ])
    const stop = controller.start()
    await flush()
    stop()

    expect(mutation.mock.calls).toEqual([
      [expect.anything(), JSON.parse(STORED_BY_V0_2_1[MATCH_RECORD]).args],
    ])
    expect(controller.getSnapshot().pending).toEqual([])
    expect(keysStartingWith(storage, "scryve.matches.pendingRecord.")).toEqual([])
  })

  it("drain, dismiss, and clear a finished cloud game's writes", async () => {
    const storage = storedV021()
    const sent: unknown[] = []
    const controller = new OutboxSyncController({
      repository: new ConnectedGameRepository(storage, "user-1"),
      publicId: "game-public",
      ownerId: "user-1",
      deviceId: asDeviceId("device-0001"),
      send: async (action) => {
        sent.push(action)
        return { operationId: action.event.operationId }
      },
      finishGame: async () => undefined,
      abandonGame: async () => undefined,
    })

    expect(controller.getSnapshot()).toMatchObject({
      pending: [{ event: { operationId: "operation-pending-00001", delta: 5 } }],
      failed: [{ reason: "Game is not active", failedAt: 220 }],
    })
    controller.setEnvironment({
      isAuthenticated: true,
      isLoading: false,
      isRefreshing: false,
      isWebSocketConnected: true,
      remoteReady: true,
    })
    await flush()
    controller.dismissFailed("operation-failed-000001")
    controller.onRemoteProjection({ ...projection(1, 25), status: "finished" })
    controller.dispose()

    expect(sent).toEqual([
      {
        schemaVersion: 1,
        event: {
          type: "life.changed",
          operationId: "operation-pending-00001",
          gameId: "game-public",
          playerId: "player-1",
          delta: 5,
          actorId: "user-1",
          deviceId: "device-0001",
          clientCreatedAt: 120,
        },
        queuedAt: 120,
        attempts: 1,
        lastAttemptAt: expect.any(Number),
      },
    ])
    expect(keysStartingWith(storage, "count.connected.")).toEqual([])
  })
})
