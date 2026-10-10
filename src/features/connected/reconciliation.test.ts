import { ConvexError } from "convex/values"

import type { ConnectedProjection, PendingLifeAction } from "./model"
import {
  classifyWriteFailure,
  mergeConfirmedProjection,
  oldestFirst,
  overlayPendingDeltas,
} from "./reconciliation"
import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "../game/domain"

const permanentFailures = [
  ["seat_owner_required", "Seat-owner permission required"],
  ["game_membership_required", "Game membership required"],
  ["game_not_active", "Game is not active"],
  ["game_not_found", "Game not found"],
  ["sync_operation_mismatch", "Operation identifier was reused with different data"],
  ["invalid_operation_id", "Invalid operation identifier"],
  ["invalid_device_id", "Invalid device identifier"],
  ["invalid_client_timestamp", "Invalid client timestamp"],
  ["invalid_life_delta", "Life delta must be a non-zero whole number from -999999 to 999999"],
]

const legacyPermanentMessage =
  /Seat-owner permission|Game membership required|Game is not active|Game not found|Operation identifier was reused|Invalid operation|Invalid device identifier|Invalid client timestamp|Life delta|ArgumentValidationError|Invalid argument|not a valid ID|acknowledgement did not match/

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

  it("shows a queued knockout on the board and on the opponent's prizes before it syncs", () => {
    const pokemonGame: ConnectedProjection = {
      ...projection,
      system: "pokemon",
      format: "standard",
      startingLife: 6,
      players: projection.players.map((player) => ({ ...player, currentLife: 6 })),
      table: {
        designations: {},
        players: {
          "player-1": {
            pokemon: {
              active: { id: "pikachu-0001", name: "Pikachu ex", hp: 200, prizes: 2, damage: 0 },
              bench: [],
            },
          },
        },
      },
    }
    const display = overlayPendingDeltas(pokemonGame, [
      {
        schemaVersion: 1,
        event: {
          type: "table.action",
          operationId: asOperationId("operation-knockout"),
          gameId: asGameId("game-public"),
          action: {
            kind: "pokemon.knockedOut",
            playerId: "player-1",
            pokemonId: "pikachu-0001",
            takerPlayerId: "player-2",
          },
          actorId: asActorId("user-1"),
          deviceId: asDeviceId("device-1"),
          clientCreatedAt: 1,
        },
        queuedAt: 1,
        attempts: 0,
      },
    ])
    expect(display.players[1]).toMatchObject({ currentLife: 4, pendingDelta: -2 })
    expect(display.table.players["player-1"].pokemon).toMatchObject({
      bench: [],
      lastKnockout: { operationId: "operation-knockout", prizesTaken: 2 },
    })
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

  it("retains authorization/game-state failures but retries auth expiry and network loss", () => {
    expect(classifyWriteFailure(new Error("Seat-owner permission required"))).toBe("permanent")
    expect(classifyWriteFailure(new Error("Game is not active"))).toBe("permanent")
    expect(classifyWriteFailure(new Error("Authentication required"))).toBe("retry")
    expect(classifyWriteFailure(new Error("Network disconnected"))).toBe("retry")
  })

  it.each(permanentFailures)("classifies %s by code regardless of wording", (code) => {
    for (const message of ["Write rejected", "This action cannot be saved"])
      expect(classifyWriteFailure(new ConvexError({ code, message }))).toBe("permanent")
  })

  it.each(permanentFailures)("keeps the legacy regex phrase for %s", (code, message) => {
    const serverError = new ConvexError({ code, message })
    expect(serverError.message).toMatch(legacyPermanentMessage)
  })

  it.each([
    ...permanentFailures.map(([, message]) => message),
    "ArgumentValidationError",
    "Invalid argument",
    "not a valid ID",
    "acknowledgement did not match",
  ])("keeps the legacy fallback for %s", (message) => {
    expect(classifyWriteFailure(new Error(message))).toBe("permanent")
    expect(classifyWriteFailure(new ConvexError({ message }))).toBe("permanent")
  })

  it.each(["unknown_code", "unauthenticated", "auth_refresh_required"])(
    "retries %s even when the message matches the legacy regex",
    (code) => {
      expect(classifyWriteFailure(new ConvexError({ code, message: "Game not found" }))).toBe(
        "retry",
      )
    },
  )

  it.each([new Error("Unexpected failure"), new Error("Network disconnected"), null, {}])(
    "retries unknown and transport failures: %s",
    (cause) => {
      expect(classifyWriteFailure(cause)).toBe("retry")
    },
  )
})
