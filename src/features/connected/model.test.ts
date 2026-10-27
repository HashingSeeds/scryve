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
  it("preserves a no-system game and its board change amount", () => {
    const projection = toConnectedProjection({
      ...legacyProjection,
      system: "none",
      format: undefined,
      ruleset: "none",
      lifeStep: 5,
    })

    expect(projection).toMatchObject({ lifeStep: 5 })
    expect(projection?.system).toBeUndefined()
    expect(projection?.format).toBeUndefined()
  })

  it("keeps legacy projections valid and normalizes missing commander fields", () => {
    const projection = toConnectedProjection(legacyProjection)
    expect(projection?.publicId).toBe("game-public")
    expect(projection?.deckRequired).toBe(false)
    expect(projection?.commanderDamage).toBeUndefined()
  })

  it("parses the connected deck requirement and rejects malformed values", () => {
    expect(toConnectedProjection({ ...legacyProjection, deckRequired: true })?.deckRequired).toBe(
      true,
    )
    expect(toConnectedProjection({ ...legacyProjection, deckRequired: "required" })).toBeNull()
  })

  it("keeps Treachery roles and the host's result, and drops unknown ones", () => {
    const projection = toConnectedProjection({
      ...legacyProjection,
      variant: "treachery",
      treacheryOutcome: { kind: "win", winnerPlayerIds: ["player-1"] },
      players: [
        { ...legacyProjection.players[0], role: "assassin", roleRevealed: false },
        { ...legacyProjection.players[0], playerId: "player-2", seat: 2, role: "jester" },
      ],
    })

    expect(projection).toMatchObject({
      variant: "treachery",
      treacheryOutcome: { kind: "win", winnerPlayerIds: ["player-1"] },
    })
    expect(projection?.players.map((player) => player.role)).toEqual(["assassin", undefined])
    expect(
      toConnectedProjection({ ...legacyProjection, treacheryOutcome: { kind: "win" } }),
    ).not.toHaveProperty("treacheryOutcome")
  })

  it("parses commander totals and pending claims", () => {
    const projection = toConnectedProjection({
      ...legacyProjection,
      players: legacyProjection.players.map((player) => ({
        ...player,
        eliminatedByCommanderDamage: false,
      })),
      commanderDamage: {
        totals: [
          { fromPlayerId: "player-1", toPlayerId: "player-2", total: 7 },
          { fromPlayerId: "player-1", toPlayerId: "player-2", commander: 1, total: 4 },
        ],
        pendingClaims: [
          {
            claimId: "claim-1",
            operationId: "operation-1",
            fromPlayerId: "player-1",
            toPlayerId: "player-2",
            commander: 1,
            delta: 3,
            clientCreatedAt: 1,
            createdAt: 2,
          },
        ],
        eliminatedPlayerIds: [],
      },
    })
    expect(projection?.players[0].eliminatedByCommanderDamage).toBe(false)
    expect(projection?.commanderDamage?.totals).toEqual([
      { fromPlayerId: "player-1", toPlayerId: "player-2", total: 7 },
      { fromPlayerId: "player-1", toPlayerId: "player-2", commander: 1, total: 4 },
    ])
    expect(projection?.commanderDamage?.pendingClaims[0]).toMatchObject({
      claimId: "claim-1",
      commander: 1,
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
