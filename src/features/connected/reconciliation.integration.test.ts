import type { ConnectedProjection, PendingLifeAction } from "./model"
import { ConnectedGameRepository } from "./persistence"
import { overlayPendingDeltas } from "./reconciliation"
import { projection } from "../../../test/fixtures/connectedProjection"
import { MemoryStorage } from "../../../test/support/memoryStorage"
import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "../game/domain"

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
const base = projection(0, 20)
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
    repository.outbox("game-public").enqueue(pending)
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
    const sent: string[] = []
    const outbox = restarted.outbox("game-public", {
      send: async (queued) => {
        sent.push(queued.event.operationId)
        return { operationId: queued.event.operationId }
      },
      rejectReason: () => undefined,
      backoff: { baseMs: 250, maxMs: 8_000 },
    })
    expect(overlayPendingDeltas(terminal, outbox.getState().pending).players[0]).toMatchObject({
      currentLife: 25,
      pendingDelta: 0,
    })
    const stop = outbox.start()
    await new Promise(setImmediate)
    stop()
    expect(sent).toEqual([operationId])
    expect(restarted.cleanupTerminalGame(terminal, outbox)).toBe(true)
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
      repository.outbox("game-public").enqueue(pending)
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
      const queued = restarted.outbox("game-public").getState().pending
      expect(overlayPendingDeltas(cached, queued).players[0]).toMatchObject({
        currentLife: terminalLife,
        pendingDelta: 0,
      })
      expect(queued).toEqual([pending])
    },
  )
})
