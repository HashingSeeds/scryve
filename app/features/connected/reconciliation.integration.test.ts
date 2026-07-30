import { drainConnectedOutbox } from "./drainOutbox"
import type { ConnectedProjection, PendingLifeAction } from "./model"
import { ConnectedGameRepository } from "./persistence"
import { optimisticallyApplyLife, overlayPendingDeltas } from "./reconciliation"
import { connectedLifeOptimisticUpdater } from "./useConnectedGame"
import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "../game/domain"

class MemoryStorage {
  values = new Map<string, string>()
  getString(key: string) {
    return this.values.get(key)
  }
  getAllKeys() {
    return [...this.values.keys()]
  }
  set(key: string, value: string) {
    this.values.set(key, value)
  }
  delete(key: string) {
    this.values.delete(key)
  }
}

const operationId = asOperationId("operation-ordering-0001")
const pending: PendingLifeAction = {
  schemaVersion: 1,
  event: {
    type: "life.changed",
    operationId,
    gameId: asGameId("game-public"),
    playerId: asPlayerId("player-1"),
    delta: 5,
    actorId: asActorId("user-a"),
    deviceId: asDeviceId("device-a-001"),
    clientCreatedAt: 1,
  },
  queuedAt: 1,
  attempts: 0,
}
const base: ConnectedProjection = {
  schemaVersion: 1,
  publicId: "game-public",
  status: "active",
  playerCount: 2,
  startingLife: 20,
  ruleset: "standard",
  isHost: true,
  eventSequence: 0,
  serverUpdatedAt: 1,
  recentOperationIds: [],
  players: [
    {
      playerId: "player-1",
      seat: 1,
      displayName: "Ada",
      color: "#111111",
      currentLife: 20,
      controlledByMe: true,
    },
    {
      playerId: "player-2",
      seat: 2,
      displayName: "Grace",
      color: "#222222",
      currentLife: 20,
      controlledByMe: false,
    },
  ],
}
const committed: ConnectedProjection = {
  ...base,
  eventSequence: 1,
  serverUpdatedAt: 2,
  recentOperationIds: [operationId],
  players: base.players.map((player) =>
    player.playerId === "player-1" ? { ...player, currentLife: 25 } : player,
  ),
}

describe("subscription/ack reconciliation ordering", () => {
  it("recovers a committed acknowledgement after its operation ages out of recent IDs", async () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-a")
    repository.enqueue(pending, [])
    const terminal = {
      ...committed,
      status: "finished" as const,
      recentOperationIds: Array.from(
        { length: 100 },
        (_, index) => `operation-newer-${String(index).padStart(4, "0")}`,
      ),
    }
    repository.saveProjection(terminal)

    const restarted = new ConnectedGameRepository(storage, "user-a")
    expect(
      overlayPendingDeltas(terminal, restarted.loadOutbox("game-public")).players[0],
    ).toMatchObject({ currentLife: 25, pendingDelta: 0 })
    const result = await drainConnectedOutbox({
      repository: restarted,
      publicId: "game-public",
      failed: [],
      send: async (queued) => ({ operationId: queued.event.operationId }),
    })
    expect(result.acknowledged).toEqual([operationId])
    expect(restarted.cleanupTerminalGame(terminal, result.pending, result.failures)).toBe(true)
    expect(restarted.loadProjection("game-public")).toBeNull()
  })

  it.each(["subscription-before-ack", "ack-before-subscription"] as const)(
    "composes the actual Convex optimistic callback with durable state: %s",
    (ordering) => {
      const storage = new MemoryStorage()
      const repository = new ConnectedGameRepository(storage, "user-a")
      repository.enqueue(pending, [])
      let query: any = base
      const store = {
        getQuery: jest.fn(() => query),
        setQuery: jest.fn((_reference, _args, value) => {
          query = value
        }),
      }

      connectedLifeOptimisticUpdater(store, {
        publicId: "game-public",
        playerId: "player-1",
        operationId,
        delta: 5,
      })
      expect(query.players[0].currentLife).toBe(25)

      if (ordering === "subscription-before-ack") {
        query = committed
        repository.saveProjection(committed)
        repository.acknowledge("game-public", operationId)
      } else {
        repository.acknowledge("game-public", operationId)
        query = committed
        repository.saveProjection(committed)
      }

      expect(query.players[0].currentLife).toBe(25)
      expect(repository.loadOutbox("game-public")).toEqual([])
      expect(repository.loadProjection("game-public")?.players[0].currentLife).toBe(25)
    },
  )

  it("keeps exactly one delta when subscription arrives before acknowledgement", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-a")
    repository.enqueue(pending)
    expect(
      overlayPendingDeltas(base, repository.loadOutbox("game-public")).players[0].currentLife,
    ).toBe(25)
    expect(
      optimisticallyApplyLife(committed, {
        publicId: "game-public",
        playerId: "player-1",
        operationId,
        delta: 5,
      }).players[0].currentLife,
    ).toBe(25)
    repository.acknowledge("game-public", operationId)
    repository.saveProjection(committed)
    expect(new ConnectedGameRepository(storage, "user-a").loadOutbox("game-public")).toEqual([])
    expect(
      new ConnectedGameRepository(storage, "user-a").loadProjection("game-public")?.players[0]
        .currentLife,
    ).toBe(25)
  })

  it("keeps optimistic life until subscription when acknowledgement arrives first", () => {
    const storage = new MemoryStorage()
    const repository = new ConnectedGameRepository(storage, "user-a")
    repository.enqueue(pending)
    const optimistic = optimisticallyApplyLife(base, {
      publicId: "game-public",
      playerId: "player-1",
      operationId,
      delta: 5,
    })
    repository.acknowledge("game-public", operationId)
    expect(optimistic.players[0].currentLife).toBe(25)
    repository.saveProjection(committed)
    expect(overlayPendingDeltas(committed, []).players[0].currentLife).toBe(25)
    expect(
      new ConnectedGameRepository(storage, "user-a").loadProjection("game-public")?.players[0]
        .currentLife,
    ).toBe(25)
  })

  it.each([
    ["committed with a lost acknowledgement", 25, [operationId]],
    ["not committed before finish", 20, []],
  ] as const)(
    "shows the terminal server total when a pending operation was %s and retains it for reconnect",
    (_scenario, terminalLife, recentOperationIds) => {
      const storage = new MemoryStorage()
      const repository = new ConnectedGameRepository(storage, "user-a")
      repository.enqueue(pending)
      const terminal: ConnectedProjection = {
        ...base,
        status: "finished",
        eventSequence: 2,
        serverUpdatedAt: 3,
        recentOperationIds: [...recentOperationIds],
        players: base.players.map((player) =>
          player.playerId === "player-1" ? { ...player, currentLife: terminalLife } : player,
        ),
      }
      repository.saveProjection(terminal)

      const restarted = new ConnectedGameRepository(storage, "user-a")
      const cached = restarted.loadProjection("game-public")!
      expect(
        overlayPendingDeltas(cached, restarted.loadOutbox("game-public")).players[0],
      ).toMatchObject({ currentLife: terminalLife, pendingDelta: 0 })
      expect(restarted.loadOutbox("game-public")).toEqual([pending])
    },
  )
})
