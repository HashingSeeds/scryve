import {
  createLanGame,
  joinLanGame,
  lanProjection,
  mergeHostGame,
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
      life: { life: 13, version: 5 },
    })

    expect("rejected" in rejoined ? null : lifeOf(rejoined, "guest")).toBe(13)
  })

  it("ignores a replayed older life total", () => {
    const game = setLanLife(startLanGame(joined(lobby(), "guest"), 20), "guest", {
      life: 12,
      version: 4,
    })

    expect(lifeOf(setLanLife(game, "guest", { life: 18, version: 3 }), "guest")).toBe(12)
  })

  it("keeps a guest's own newer life when the host has not caught up", () => {
    const host = startLanGame(joined(lobby(), "guest"), 20)
    const merged = mergeHostGame(host, "guest", { life: 9, version: 7 })

    expect(lifeOf(merged, "guest")).toBe(9)
    expect(lanProjection(merged, "guest").players.map((player) => player.controlledByMe)).toEqual([
      false,
      true,
    ])
  })
})
