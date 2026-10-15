import {
  admitLanGuest,
  claimLanCommanderDamage,
  createLanGame,
  LAN_MAX_SEATS,
  lastClaimSeq,
  lanProjection,
  MAX_LAN_VERSION_STEP,
  mergeHostGame,
  parseGuestMessage,
  releaseLanSeat,
  resolveLanCommanderClaim,
  resolveLanGuestCommanderClaim,
  setLanLife,
  startLanGame,
  type LanGame,
  type LanSeatPass,
} from "./lanGame"

const lobby = () => createLanGame("game", "host", "Host")
const tokens = new Map<string, string>()
const late = { type: "join", name: "late" } as const
const unused = { key: "unused", token: "unused" }

function seatGuest(game: LanGame, key: string) {
  const pass = { key, token: `token-${key}` }
  const admitted = admitLanGuest(game, tokens, { type: "join", name: key }, pass)
  if ("rejected" in admitted) throw new Error(admitted.rejected)
  tokens.set(key, pass.token)
  return admitted.game
}

const rejoin = (game: LanGame, pass: LanSeatPass) =>
  admitLanGuest(game, tokens, { type: "join", name: "x", pass }, unused)

const lifeOf = (game: LanGame, key: string) => game.seats.find((seat) => seat.key === key)?.life

describe("LAN game", () => {
  it("seats new guests only in the lobby and only up to the board's player limit", () => {
    let full = lobby()
    for (let index = 1; index < LAN_MAX_SEATS; index += 1) full = seatGuest(full, `guest-${index}`)
    const started = startLanGame(seatGuest(lobby(), "guest"), 20)

    expect(admitLanGuest(full, tokens, late, unused)).toEqual({ rejected: "This game is full." })
    expect(admitLanGuest(started, tokens, late, unused)).toEqual({
      rejected: "This game has already started.",
    })
  })

  it("returns a seat only to the pass it was issued with, and never hands out the host's", () => {
    const game = startLanGame(seatGuest(lobby(), "guest"), 20)

    expect(rejoin(game, { key: "guest", token: "token-guest" })).not.toHaveProperty("rejected")
    expect(rejoin(game, { key: "guest", token: "guessed" })).toEqual({
      rejected: "That seat belongs to another device.",
    })
    expect(rejoin(game, { key: "host", token: "anything" })).toHaveProperty("rejected")
  })

  it("gives a guest whose lobby seat was freed a new seat instead of turning it away", () => {
    const freed = releaseLanSeat(seatGuest(lobby(), "left"), "left")
    const back = admitLanGuest(
      freed,
      tokens,
      { type: "join", name: "back", pass: { key: "left", token: "token-left" } },
      { key: "fresh", token: "fresh-token" },
    )

    expect(back).toMatchObject({ pass: { key: "fresh" } })
    expect(
      admitLanGuest(
        startLanGame(freed, 20),
        tokens,
        { type: "join", name: "x", pass: { key: "left", token: "token-left" } },
        unused,
      ),
    ).toEqual({
      rejected: "This game has already started.",
    })
  })

  it("ignores a replayed older life total and a version jump that would lock the seat", () => {
    const game = setLanLife(startLanGame(seatGuest(lobby(), "guest"), 20), "guest", {
      life: 12,
      version: 4,
      round: 1,
    })
    const jump = { life: 1, version: 4 + MAX_LAN_VERSION_STEP + 1, round: 1 }

    expect(lifeOf(setLanLife(game, "guest", { life: 18, version: 3, round: 1 }), "guest")).toBe(12)
    expect(lifeOf(setLanLife(game, "guest", jump), "guest")).toBe(12)
    expect(parseGuestMessage('{"type":"life","life":1,"version":1e308,"round":1}')).toBeNull()
  })

  it("keeps a guest's own newer life when the host has not caught up", () => {
    const host = startLanGame(seatGuest(lobby(), "guest"), 20)
    const merged = mergeHostGame(host, "guest", { life: 9, version: 7, round: 1 })

    expect(lifeOf(merged, "guest")).toBe(9)
    expect(lanProjection(merged, "guest").players.map((player) => player.controlledByMe)).toEqual([
      false,
      true,
    ])
  })

  it("keeps a restart's starting life over a total from the previous game", () => {
    const first = startLanGame(seatGuest(lobby(), "guest"), 20)
    const restarted = startLanGame(first, 40)
    const stale = { life: 3, version: 9, round: first.round }

    expect(lifeOf(setLanLife(restarted, "guest", stale), "guest")).toBe(40)
    expect(lifeOf(mergeHostGame(restarted, "guest", stale), "guest")).toBe(40)
  })

  it("frees a lobby seat but holds a started game's seat for its owner to rejoin", () => {
    const lobbyGame = seatGuest(seatGuest(lobby(), "left"), "stays")
    const away = releaseLanSeat(startLanGame(lobbyGame, 20), "left")

    expect(releaseLanSeat(lobbyGame, "left").seats.map(({ key, seat }) => [key, seat])).toEqual([
      ["host", 1],
      ["stays", 2],
    ])
    expect(startLanGame(away, 20).seats.map((seat) => seat.key)).toEqual(["host", "left", "stays"])
  })
})

describe("LAN commander damage", () => {
  const commanderGame = () => startLanGame(seatGuest(lobby(), "guest"), 40, "commander")
  const claim = (game: LanGame, delta: number, id = "claim") =>
    claimLanCommanderDamage(game, "host", {
      id,
      to: "guest",
      delta,
      round: game.round,
      seq: lastClaimSeq(game, "host") + 1,
    })

  it("changes the defender's life only when the defender confirms", () => {
    const claimed = claim(commanderGame(), 7)
    const declined = resolveLanCommanderClaim(claimed, "guest", { id: "claim", accepted: false })
    const confirmed = resolveLanCommanderClaim(claimed, "guest", { id: "claim", accepted: true })

    expect(lanProjection(claimed, "guest").commanderDamage?.pendingClaims).toHaveLength(1)
    expect(lanProjection(claimed, "host").commanderDamage?.pendingClaims).toEqual([])
    expect(resolveLanCommanderClaim(claimed, "host", { id: "claim", accepted: true })).toBe(claimed)
    expect(lifeOf(declined, "guest")).toBe(40)
    expect(lifeOf(confirmed, "guest")).toBe(33)
    expect(confirmed.commander).toEqual({
      totals: [{ from: "host", to: "guest", total: 7 }],
      claims: [],
      sequences: [{ key: "host", seq: 1 }],
    })
  })

  it("never takes a replayed or earlier-round claim again", () => {
    const first = { id: "first", to: "guest", delta: 7, round: 1, seq: 1 }
    const settled = resolveLanCommanderClaim(
      claimLanCommanderDamage(commanderGame(), "host", first),
      "guest",
      { id: "first", accepted: false },
    )
    const restarted = startLanGame(commanderGame(), 40, "commander")

    expect(claimLanCommanderDamage(settled, "host", first)).toBe(settled)
    expect(claimLanCommanderDamage(restarted, "host", first)).toBe(restarted)
  })

  it("marks a player out at 21 and drops claims Convex would decline", () => {
    let game = commanderGame()
    for (const id of ["a", "b", "c"])
      game = resolveLanCommanderClaim(claim(game, 7, id), "guest", { id, accepted: true })

    expect(lanProjection(game, "host").commanderDamage?.eliminatedPlayerIds).toEqual(["guest"])
    expect(claim(game, -22, "d").commander).toMatchObject({
      claims: [],
      sequences: [{ key: "host", seq: 4 }],
    })
    expect(claim(claim(game, 1, "x"), 1, "y").commander?.claims).toHaveLength(1)
    expect(claim(startLanGame(seatGuest(lobby(), "guest"), 20), 5)).toEqual(
      startLanGame(seatGuest(lobby(), "guest"), 20),
    )
  })

  it("takes the damage once when a reconnecting guest's life arrives before its replayed confirm", () => {
    const life = { life: 33, version: 1, round: 1 }
    const rejoined = setLanLife(claim(commanderGame(), 7), "guest", life)
    const replayed = resolveLanGuestCommanderClaim(rejoined, "guest", {
      type: "commander.resolve",
      id: "claim",
      accepted: true,
      life,
    })

    expect(lifeOf(replayed, "guest")).toBe(33)
    expect(replayed.commander).toEqual({
      totals: [{ from: "host", to: "guest", total: 7 }],
      claims: [],
      sequences: [{ key: "host", seq: 1 }],
    })
  })

  it("clears commander damage when the host starts again", () => {
    const hit = resolveLanCommanderClaim(claim(commanderGame(), 5), "guest", {
      id: "claim",
      accepted: true,
    })

    expect(startLanGame(hit, 40, "commander").commander).toEqual({
      totals: [],
      claims: [],
      sequences: [],
    })
    expect(startLanGame(hit, 20)).not.toHaveProperty("commander")
  })
})
