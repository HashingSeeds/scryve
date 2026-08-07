import type { ConnectedProjection, PendingLifeAction } from "./model"
import {
  classifyWriteFailure,
  mergeConfirmedProjection,
  oldestFirst,
  optimisticallyApplyLife,
  overlayPendingDeltas,
} from "./reconciliation"
import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "../game/domain"

const projection: ConnectedProjection = {
  schemaVersion: 1,
  publicId: "game-public",
  status: "active",
  playerCount: 2,
  startingLife: 20,
  ruleset: "standard",
  isHost: true,
  eventSequence: 4,
  serverUpdatedAt: 100,
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

describe("connected reconciliation", () => {
  it("renders confirmed totals plus only unacknowledged deltas, including negative life", () => {
    const display = overlayPendingDeltas(
      { ...projection, recentOperationIds: ["operation-confirmed"] },
      [
        action("operation-confirmed", 5, 1),
        action("operation-pending", -5, 2),
        action("operation-minus", -1, 3),
      ],
    )
    expect(display.players[0]).toMatchObject({ currentLife: 14, pendingDelta: -6 })
    expect(display.players[1]).toMatchObject({ currentLife: 20, pendingDelta: 0 })
  })

  it.each(["finished", "abandoned"] as const)(
    "renders authoritative totals without a pending overlay when the game is %s",
    (status) => {
      const display = overlayPendingDeltas({ ...projection, status }, [
        action("operation-terminal", 5, 1),
      ])
      expect(display.players[0]).toMatchObject({ currentLife: 20, pendingDelta: 0 })
    },
  )

  it("never lets an older or reordered subscription replace a newer projection", () => {
    const newer = { ...projection, eventSequence: 8, serverUpdatedAt: 200 }
    expect(mergeConfirmedProjection(newer, projection)).toBe(newer)
    expect(
      mergeConfirmedProjection(newer, { ...newer, serverUpdatedAt: 201, players: [] }).players,
    ).toEqual([])
  })

  it("drains deterministically oldest-first after process recovery", () => {
    expect(
      oldestFirst([action("operation-b", 1, 20), action("operation-a", 5, 10)]).map(
        (item) => item.event.operationId,
      ),
    ).toEqual(["operation-a", "operation-b"])
  })

  it("scopes optimistic updates and prevents a pending overlay from applying twice", () => {
    const optimistic = optimisticallyApplyLife(projection, {
      publicId: "game-public",
      playerId: "player-1",
      operationId: "operation-optimistic",
      delta: 5,
    })
    expect(optimistic.players.map((player) => player.currentLife)).toEqual([25, 20])
    expect(
      overlayPendingDeltas(optimistic, [action("operation-optimistic", 5, 1)]).players[0]
        .currentLife,
    ).toBe(25)
    expect(
      optimisticallyApplyLife(projection, {
        publicId: "different-game",
        playerId: "player-1",
        operationId: "operation-other",
        delta: 5,
      }).players,
    ).toEqual(projection.players)
    const committed = {
      ...projection,
      recentOperationIds: ["operation-optimistic"],
      players: projection.players.map((player, index) =>
        index === 0 ? { ...player, currentLife: 25 } : player,
      ),
    }
    expect(
      optimisticallyApplyLife(committed, {
        publicId: "game-public",
        playerId: "player-1",
        operationId: "operation-optimistic",
        delta: 5,
      }).players[0].currentLife,
    ).toBe(25)
  })

  it("retains authorization/game-state failures but retries auth expiry and network loss", () => {
    expect(classifyWriteFailure(new Error("Seat-owner permission required"))).toBe("permanent")
    expect(classifyWriteFailure(new Error("Game is not active"))).toBe("permanent")
    expect(classifyWriteFailure(new Error("Authentication required"))).toBe("retry")
    expect(classifyWriteFailure(new Error("Network disconnected"))).toBe("retry")
  })
})
