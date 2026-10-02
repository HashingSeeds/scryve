import { drainConnectedOutbox } from "./drainOutbox"
import type { ConnectedProjection, PendingLifeAction } from "./model"
import { ConnectedGameRepository } from "./persistence"
import { overlayPendingDeltas } from "./reconciliation"
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

describe("connected acknowledgement recovery", () => {
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
