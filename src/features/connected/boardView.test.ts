import { structurallyEqual } from "@/utils/structurallyEqual"

import { connectedBoardView, connectedLastStanding, connectedLives } from "./boardView"
import type { ConnectedDisplayProjection } from "./model"

function projection(
  lives: [number, number],
  overrides: Partial<ConnectedDisplayProjection> = {},
): ConnectedDisplayProjection {
  return {
    schemaVersion: 1,
    publicId: "game-public",
    status: "active",
    playerCount: 2,
    startingLife: 40,
    ruleset: "commander",
    isHost: true,
    eventSequence: lives[0] + lives[1],
    serverUpdatedAt: lives[0] * 1000,
    recentOperationIds: [`operation-${lives[0]}`],
    table: { designations: {}, players: {} },
    players: lives.map((life, index) => ({
      playerId: `player-${index + 1}`,
      seat: index + 1,
      displayName: `Player ${index + 1}`,
      color: "#7C3AED",
      currentLife: life,
      pendingDelta: index === 0 ? 40 - life : 0,
      controlledByMe: index === 0,
    })),
    ...overrides,
  }
}

describe("connectedBoardView", () => {
  it("stays equal when only life totals and per-change bookkeeping move", () => {
    const before = projection([40, 40])
    const after = projection([37, 40])

    expect(structurallyEqual(connectedBoardView(before), connectedBoardView(after))).toBe(true)
    expect(connectedLives(after)).toEqual({ "player-1": 37, "player-2": 40 })
  })

  it("changes when the board's layout inputs change", () => {
    const before = projection([40, 40])
    const renamed = projection([40, 40], {
      players: before.players.map((player) => ({ ...player, displayName: "Renamed" })),
    })

    expect(structurallyEqual(connectedBoardView(before), connectedBoardView(renamed))).toBe(false)
    expect(
      connectedBoardView(projection([40, 31], { status: "finished" })).finalEventSequence,
    ).toBe(71)
  })
})

describe("connectedLastStanding", () => {
  it("names the only seat left once the other hits 0", () => {
    expect(connectedLastStanding(projection([0, 8000], { system: "ygo" }))).toBe("player-2")
    expect(connectedLastStanding(projection([100, 8000], { system: "ygo" }))).toBeUndefined()
  })
})
