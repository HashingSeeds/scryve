import { drainConnectedOutbox } from "./drainOutbox"
import type { PendingLifeAction } from "./model"
import { ConnectedGameRepository } from "./persistence"
import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "../game/domain"

class MemoryStorage {
  values = new Map<string, string>()
  getAllKeysCalls = 0
  getString(key: string) {
    return this.values.get(key)
  }
  getAllKeys() {
    this.getAllKeysCalls += 1
    return [...this.values.keys()]
  }
  set(key: string, value: string) {
    this.values.set(key, value)
  }
  delete(key: string) {
    this.values.delete(key)
  }
}

function action(operationId: string, delta: -5 | -1 | 1 | 5, queuedAt: number): PendingLifeAction {
  return {
    schemaVersion: 1,
    event: {
      type: "life.changed",
      operationId: asOperationId(operationId),
      gameId: asGameId("game-public"),
      playerId: asPlayerId("player-1"),
      delta,
      actorId: asActorId("user-1"),
      deviceId: asDeviceId("device-1"),
      clientCreatedAt: queuedAt,
    },
    queuedAt,
    attempts: 0,
  }
}

describe("connected outbox drain", () => {
  it("loads the durable outbox once for an entire drain cycle", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage)
    const first = action("operation-one-load-01", 1, 1)
    const second = action("operation-one-load-02", 5, 2)
    repository.enqueue(first, [])
    repository.enqueue(second, [first])
    storage.getAllKeysCalls = 0

    await drainConnectedOutbox({
      repository,
      publicId: "game-public",
      failed: [],
      send: async (queued) => ({ operationId: queued.event.operationId }),
    })

    expect(storage.getAllKeysCalls).toBe(1)
  })

  it("sends oldest-first and cleans acknowledgements", async () => {
    const repository = new ConnectedGameRepository(new MemoryStorage())
    repository.enqueue(action("operation-second", 1, 2))
    repository.enqueue(action("operation-first-1", 5, 1))
    const sent: string[] = []
    const result = await drainConnectedOutbox({
      repository,
      publicId: "game-public",
      send: async (queued) => {
        sent.push(queued.event.operationId)
        return { operationId: queued.event.operationId }
      },
    })
    expect(sent).toEqual(["operation-first-1", "operation-second"])
    expect(result.acknowledged).toEqual(sent)
    expect(repository.loadOutbox("game-public")).toEqual([])
  })

  it("recovers a lost acknowledgement by replaying the server-committed operation once", async () => {
    const repository = new ConnectedGameRepository(new MemoryStorage())
    repository.enqueue(action("operation-lost-ack", 5, 1))
    repository.enqueue(action("operation-after-ack", 1, 2))
    const committed = new Set<string>()
    let total = 20
    let loseFirstAck = true
    const send = async (queued: PendingLifeAction) => {
      if (!committed.has(queued.event.operationId)) {
        committed.add(queued.event.operationId)
        total += queued.event.delta
      }
      if (loseFirstAck) {
        loseFirstAck = false
        throw new Error("Network disconnected after commit")
      }
      return { operationId: queued.event.operationId }
    }
    expect(
      (await drainConnectedOutbox({ repository, publicId: "game-public", send })).stoppedForRetry,
    ).toBe(true)
    expect(repository.loadOutbox("game-public")).toHaveLength(2)
    expect(
      (await drainConnectedOutbox({ repository, publicId: "game-public", send })).stoppedForRetry,
    ).toBe(false)
    expect(total).toBe(26)
    expect(committed.size).toBe(2)
    expect(repository.loadOutbox("game-public")).toEqual([])
  })

  it("keeps auth-expired actions pending and retains permanent game-state failures", async () => {
    const repository = new ConnectedGameRepository(new MemoryStorage())
    repository.enqueue(action("operation-auth-expired", 1, 1))
    const authResult = await drainConnectedOutbox({
      repository,
      publicId: "game-public",
      send: async () => {
        throw new Error("Authentication required")
      },
    })
    expect(authResult.stoppedForRetry).toBe(true)
    expect(repository.loadOutbox("game-public")).toHaveLength(1)

    const failedResult = await drainConnectedOutbox({
      repository,
      publicId: "game-public",
      send: async () => {
        throw new Error("Game is not active")
      },
      now: () => 50,
    })
    expect(failedResult.failed).toEqual(["operation-auth-expired"])
    expect(repository.loadOutbox("game-public")).toEqual([])
    expect(repository.loadFailed("game-public")[0]).toMatchObject({
      reason: "Game is not active",
      failedAt: 50,
    })
  })

  it("retains deterministic client/server argument validation as a failed action", async () => {
    const repository = new ConnectedGameRepository(new MemoryStorage())
    repository.enqueue(action("operation-invalid-arg", 1, 1))
    const result = await drainConnectedOutbox({
      repository,
      publicId: "game-public",
      send: async () => {
        throw new Error("ArgumentValidationError: not a valid ID")
      },
      now: () => 75,
    })
    expect(result).toMatchObject({ failed: ["operation-invalid-arg"], stoppedForRetry: false })
    expect(repository.loadFailed("game-public")[0]).toMatchObject({
      reason: "ArgumentValidationError: not a valid ID",
      failedAt: 75,
    })
  })

  it("stops without hiding a permanent rejection when failed-action storage is full", async () => {
    const repository = new ConnectedGameRepository(new MemoryStorage(), "user-1", {
      maxFailedRecords: 1,
      maxFailedBytes: 10_000,
    })
    const prior = action("operation-prior-failure", 1, 1)
    const blocked = action("operation-blocked-fail", 5, 2)
    repository.enqueue(prior, [])
    repository.fail("game-public", prior.event.operationId, "Game is not active", 10)
    repository.enqueue(blocked, [])

    const result = await drainConnectedOutbox({
      repository,
      publicId: "game-public",
      failed: repository.loadFailed("game-public"),
      send: async () => {
        throw new Error("Game is not active")
      },
    })

    expect(result).toMatchObject({
      blockedByFailureCapacity: true,
      failed: [],
      stoppedForRetry: false,
    })
    expect(repository.loadFailed("game-public")).toHaveLength(1)
    expect(repository.loadOutbox("game-public")).toEqual([
      expect.objectContaining({
        attempts: 1,
        event: expect.objectContaining({ operationId: blocked.event.operationId }),
      }),
    ])
  })

  it("observes failure capacity freed while a permanent rejection is in flight", async () => {
    const repository = new ConnectedGameRepository(new MemoryStorage(), "user-1", {
      maxFailedRecords: 1,
      maxFailedBytes: 10_000,
    })
    const prior = action("operation-prior-failure", 1, 1)
    const rejected = action("operation-rejected-in-flight", 5, 2)
    repository.enqueue(prior, [])
    repository.fail("game-public", prior.event.operationId, "Game is not active", 10)
    repository.enqueue(rejected, [])
    let rejectSend!: (cause: Error) => void
    const deferredSend = new Promise<never>((_resolve, reject) => {
      rejectSend = reject
    })

    const draining = drainConnectedOutbox({
      repository,
      publicId: "game-public",
      failed: repository.loadFailed("game-public"),
      currentFailures: () => repository.loadFailed("game-public"),
      send: () => deferredSend,
      now: () => 50,
    })
    await Promise.resolve()
    repository.dismissFailed("game-public", prior.event.operationId)
    rejectSend(new Error("Game is not active"))

    await expect(draining).resolves.toMatchObject({
      blockedByFailureCapacity: false,
      failed: [rejected.event.operationId],
      pending: [],
    })
    expect(repository.loadFailed("game-public")).toEqual([
      expect.objectContaining({
        action: expect.objectContaining({
          event: expect.objectContaining({ operationId: rejected.event.operationId }),
        }),
      }),
    ])
    expect(repository.loadOutbox("game-public")).toEqual([])
  })

  it("stops before a second send when the owning runtime is unmounted", async () => {
    const repository = new ConnectedGameRepository(new MemoryStorage())
    repository.enqueue(action("operation-owner-a-01", 1, 1))
    repository.enqueue(action("operation-owner-a-02", 5, 2))
    let resolveFirst!: (value: { operationId: string }) => void
    const first = new Promise<{ operationId: string }>((resolve) => {
      resolveFirst = resolve
    })
    const sent: string[] = []
    let mounted = true
    const draining = drainConnectedOutbox({
      repository,
      publicId: "game-public",
      shouldContinue: () => mounted,
      send: async (queued) => {
        sent.push(queued.event.operationId)
        return sent.length === 1 ? first : { operationId: queued.event.operationId }
      },
    })
    await Promise.resolve()
    expect(sent).toEqual(["operation-owner-a-01"])
    mounted = false
    resolveFirst({ operationId: "operation-owner-a-01" })
    await draining
    expect(sent).toEqual(["operation-owner-a-01"])
    expect(repository.loadOutbox("game-public").map((item) => item.event.operationId)).toEqual([
      "operation-owner-a-02",
    ])
  })
})
