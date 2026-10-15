import {
  createLanGame,
  joinLanGame,
  lanProjection,
  mergeHostGame,
  releaseLanSeat,
  setLanLife,
  startLanGame,
  type LanGame,
} from "./lanGame"

const lobby = () => createLanGame("game", { playerId: "host", name: "Host" })

function joined(game: LanGame, playerId: string) {
  const next = joinLanGame(game, { type: "join", playerId, name: playerId })
  if ("rejected" in next) throw new Error(next.rejected)
  return next
}

const lifeOf = (game: LanGame, playerId: string) =>
  game.seats.find((seat) => seat.playerId === playerId)?.life

describe("LAN game", () => {
  it("seats new devices only while in the lobby", () => {
    const game = startLanGame(joined(lobby(), "guest"), 40)

    expect(joinLanGame(game, { type: "join", playerId: "late", name: "Late" })).toEqual({
      rejected: "This game has already started.",
    })
    expect(game.seats.map((seat) => [seat.playerId, seat.life])).toEqual([
      ["host", 40],
      ["guest", 40],
    ])
  })

  it("lets a returning device keep its seat and restore a newer life total", () => {
    const game = startLanGame(joined(lobby(), "guest"), 20)
    const rejoined = joinLanGame(game, {
      type: "join",
      playerId: "guest",
      name: "guest",
      life: { life: 13, version: 5, round: 1 },
    })

    expect("rejected" in rejoined ? null : lifeOf(rejoined, "guest")).toBe(13)
  })

  it("ignores a replayed older life total", () => {
    const game = setLanLife(startLanGame(joined(lobby(), "guest"), 20), "guest", {
      life: 12,
      version: 4,
      round: 1,
    })

    expect(lifeOf(setLanLife(game, "guest", { life: 18, version: 3, round: 1 }), "guest")).toBe(12)
  })

  it("keeps a guest's own newer life when the host has not caught up", () => {
    const host = startLanGame(joined(lobby(), "guest"), 20)
    const merged = mergeHostGame(host, "guest", { life: 9, version: 7, round: 1 })

    expect(lifeOf(merged, "guest")).toBe(9)
    expect(lanProjection(merged, "guest").players.map((player) => player.controlledByMe)).toEqual([
      false,
      true,
    ])
  })

  it("keeps a restart's starting life over a total from the previous game", () => {
    const first = startLanGame(joined(lobby(), "guest"), 20)
    const restarted = startLanGame(first, 40)
    const stale = { life: 3, version: 9, round: first.round }

    expect(lifeOf(setLanLife(restarted, "guest", stale), "guest")).toBe(40)
    expect(lifeOf(mergeHostGame(restarted, "guest", stale), "guest")).toBe(40)
  })

  it("frees a lobby seat, holds one mid-game, and drops it if still away at the next start", () => {
    const lobbyGame = joined(joined(lobby(), "left"), "stays")

    expect(
      releaseLanSeat(lobbyGame, "left").seats.map(({ playerId, seat }) => [playerId, seat]),
    ).toEqual([
      ["host", 1],
      ["stays", 2],
    ])
    const finished = {
      ...releaseLanSeat(startLanGame(lobbyGame, 20), "left"),
      status: "finished" as const,
    }
    expect(finished.seats).toHaveLength(3)
    expect(startLanGame(finished, 20).seats.map((seat) => seat.playerId)).toEqual(["host", "stays"])
  })
})
