import { buildLocalGameSnapshot } from "@/features/connected/localGameSnapshot"
import { asPlayerId, commanderDamageKey, createLocalGame } from "@/features/game/domain"
import type { LocalGame } from "@/features/game/types"

const identifiers = {
  operationId: "publish_operation_0000001",
  publicId: "published-game-id-00001",
  inviteToken: "t".repeat(43),
  manualCodeCandidates: ["ABC234", "DEF567"],
}

function commanderGame(): LocalGame {
  return createLocalGame({
    players: [
      { name: "Ada", color: "#FF0000" },
      { name: "Grace", color: "#00FF00" },
      { name: "Alan", color: "#0000FF" },
    ],
    startingLife: 40,
    system: "mtg",
    format: "commander",
  })
}

describe("buildLocalGameSnapshot", () => {
  it("rebases zero-based local seats onto the server's one-based seats", () => {
    const game = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#00FF00" },
      ],
      startingLife: 20,
    })
    const snapshot = buildLocalGameSnapshot({
      game,
      hostPlayerId: game.players[0].id,
      ...identifiers,
    })

    expect(game.players.map((player) => player.seat)).toEqual([0, 1])
    expect(snapshot.players.map((player) => player.seat)).toEqual([1, 2])
    expect(snapshot.players.map((player) => player.localId)).toEqual([
      game.players[0].id,
      game.players[1].id,
    ])
    expect(snapshot.hostLocalId).toBe(game.players[0].id)
  })

  it("carries per-seat life rather than the starting life", () => {
    const game = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#00FF00" },
      ],
      startingLife: 20,
    })
    const played: LocalGame = {
      ...game,
      players: [{ ...game.players[0], life: 17 }, game.players[1]],
    }

    const snapshot = buildLocalGameSnapshot({
      game: played,
      hostPlayerId: played.players[0].id,
      ...identifiers,
    })

    expect(snapshot.players.map((player) => player.currentLife)).toEqual([17, 20])
  })

  it("maps commander damage keys onto one-based seat pairs", () => {
    const game = commanderGame()
    const [ada, grace, alan] = game.players
    const played: LocalGame = {
      ...game,
      commanderDamage: {
        [commanderDamageKey(ada.id, grace.id)]: 7,
        [commanderDamageKey(alan.id, ada.id)]: 21,
      },
    }

    const snapshot = buildLocalGameSnapshot({
      game: played,
      hostPlayerId: ada.id,
      ...identifiers,
    })

    expect(snapshot.commanderTotals).toEqual([
      { fromSeat: 1, toSeat: 2, total: 7 },
      { fromSeat: 3, toSeat: 1, total: 21 },
    ])
  })

  it("omits commander totals outside Commander games", () => {
    const game = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#00FF00" },
      ],
      startingLife: 20,
      system: "mtg",
      format: "standard",
    })
    const played: LocalGame = {
      ...game,
      commanderDamage: { [commanderDamageKey(game.players[0].id, game.players[1].id)]: 5 },
    }

    expect(
      buildLocalGameSnapshot({ game: played, hostPlayerId: game.players[0].id, ...identifiers })
        .commanderTotals,
    ).toBeUndefined()
  })

  it("falls back to a system-less ruleset when the game has no format", () => {
    const game = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#00FF00" },
      ],
      startingLife: 20,
    })

    const snapshot = buildLocalGameSnapshot({
      game,
      hostPlayerId: game.players[0].id,
      ...identifiers,
    })

    expect(snapshot.ruleset).toBe("none")
    expect(snapshot.format).toBeUndefined()
  })

  it("refuses a host seat that is not in the game", () => {
    const game = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#00FF00" },
      ],
      startingLife: 20,
    })

    expect(() =>
      buildLocalGameSnapshot({ game, hostPlayerId: asPlayerId("player_missing"), ...identifiers }),
    ).toThrow("The host seat must be one of this game's players")
  })
})
