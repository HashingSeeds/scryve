import { toConnectedProjection } from "./model"

const legacyProjection = {
  schemaVersion: 1,
  publicId: "game-public",
  status: "active",
  playerCount: 2,
  startingLife: 40,
  ruleset: "commander",
  isHost: false,
  eventSequence: 1,
  serverUpdatedAt: 1,
  recentOperationIds: [],
  players: [
    {
      playerId: "player-1",
      seat: 1,
      displayName: "Ada",
      color: "#111111",
      currentLife: 40,
      controlledByMe: true,
    },
  ],
}

describe("connected projection parsing", () => {
  it("keeps legacy projections valid and normalizes missing commander fields", () => {
    const projection = toConnectedProjection(legacyProjection)
    expect(projection?.publicId).toBe("game-public")
    expect(projection?.commanderDamage).toBeUndefined()
  })

  it("parses commander totals and pending claims", () => {
    const projection = toConnectedProjection({
      ...legacyProjection,
      players: legacyProjection.players.map((player) => ({
        ...player,
        eliminatedByCommanderDamage: false,
      })),
      commanderDamage: {
        totals: [{ fromPlayerId: "player-1", toPlayerId: "player-2", total: 7 }],
        pendingClaims: [
          {
            claimId: "claim-1",
            operationId: "operation-1",
            fromPlayerId: "player-1",
            toPlayerId: "player-2",
            delta: 3,
            clientCreatedAt: 1,
            createdAt: 2,
          },
        ],
        eliminatedPlayerIds: [],
      },
    })
    expect(projection?.players[0].eliminatedByCommanderDamage).toBe(false)
    expect(projection?.commanderDamage?.totals[0]).toMatchObject({ total: 7 })
    expect(projection?.commanderDamage?.pendingClaims[0]).toMatchObject({
      claimId: "claim-1",
    })
  })

  it("rejects malformed commander records without rejecting the whole legacy shape", () => {
    expect(
      toConnectedProjection({ ...legacyProjection, commanderDamage: { totals: [{ total: -1 }] } }),
    ).toBeNull()
    expect(
      toConnectedProjection({
        ...legacyProjection,
        commanderDamage: { pendingClaims: [{ claimId: "claim-1" }] },
      }),
    ).toBeNull()
  })
})
