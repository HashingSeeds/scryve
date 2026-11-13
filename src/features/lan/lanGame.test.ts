import { lanLocalGame } from "./lanArchive"
import {
  admitLanGuest,
  applyLanWrite,
  createLanGame,
  endLanMatch,
  endLanRound,
  LAN_PROTOCOL,
  lanLobbyOf,
  lanMatchAfter,
  lanLog,
  mergeLanLog,
  lanProjection,
  lanSeatAppearance,
  lanSeatsReady,
  parseGuestMessage,
  parseLanSetup,
  parseHostMessage,
  releaseLanSeat,
  revealLanRole,
  setLanConnected,
  setLanDeck,
  setLanPlayerCount,
  startLanRound,
  swapLanSeats,
  type LanGame,
  type LanSeatPass,
  type LanSetup,
} from "./lanGame"
import { encodeLine, MAX_LINE_BYTES } from "./lineReader"
import type { ConnectedLogEvent } from "../../../convex/lib/gameLog"
import type { ConnectedActionEvent } from "../connected/model"

const NOW = 1_700_000_000_000
const commander: LanSetup = {
  playerCount: 2,
  startingLife: 40,
  lifeStep: 1,
  ruleset: "commander",
  system: "mtg",
  format: "commander",
}
const tokens = new Map<string, string>()
const join = (name: string, pass?: LanSeatPass) =>
  ({ type: "join", protocol: LAN_PROTOCOL, name, ...(pass ? { pass } : {}) }) as const
const unused = { key: "unused", token: "unused" }

const lobby = (setup: LanSetup = commander) => createLanGame("game", "host", "Host", setup, NOW)

function seatGuest(game: LanGame, key: string) {
  const pass = { key, token: `token-${key}` }
  const admitted = admitLanGuest(game, tokens, join(key), pass)
  if ("rejected" in admitted) throw new Error(admitted.rejected)
  tokens.set(key, pass.token)
  return admitted.game
}

const started = (setup: LanSetup = commander) =>
  startLanRound(seatGuest(lobby(setup), "guest"), NOW)

function op(event: Record<string, unknown>): ConnectedActionEvent {
  const message = parseGuestMessage(
    JSON.stringify({
      type: "op",
      event: {
        gameId: "game-1",
        actorId: "actor",
        deviceId: "device-0001",
        clientCreatedAt: NOW,
        ...event,
      },
    }),
  )
  if (message?.type !== "op") throw new Error("not an op")
  return message.event
}

const life = (operationId: string, playerId: string, delta: number) =>
  op({ type: "life.changed", operationId, playerId, delta })

const lifeOf = (game: LanGame, viewer: string, key: string) =>
  lanProjection(game, viewer).players.find((player) => player.playerId === key)?.currentLife

function write(game: LanGame, sender: string, event: ConnectedActionEvent) {
  const { game: next, result } = applyLanWrite(game, sender, event, NOW)
  return { next, result }
}

describe("nearby lobby", () => {
  it("seats guests up to the chosen player count, only in the lobby and on this protocol", () => {
    const full = seatGuest(lobby(), "guest")

    expect(admitLanGuest(full, tokens, join("late"), unused)).toEqual({
      rejected: "This game is full.",
    })
    expect(
      admitLanGuest(lobby(), tokens, { type: "join", protocol: 1, name: "old" }, unused),
    ).toEqual({ rejected: "Update Scryve to join this game." })
    expect(admitLanGuest(startLanRound(full, NOW), tokens, join("late"), unused)).toEqual({
      rejected: "This game has already started.",
    })
  })

  it("asks a guest to update when its build can't play the lobby's system", () => {
    const pokemon = lobby({ ...commander, system: "pokemon", format: "standard" })
    const joinWith = (systems?: string[]) => {
      const message = parseGuestMessage(JSON.stringify({ ...join("guest"), systems }))
      if (message?.type !== "join") throw new Error("not a join")
      return admitLanGuest(pokemon, tokens, message, unused)
    }

    expect(joinWith(["mtg", "lorcana"])).toEqual({ rejected: "Update Scryve to join this game." })
    expect(joinWith(["mtg", "pokemon"])).not.toHaveProperty("rejected")
    expect(joinWith()).not.toHaveProperty("rejected")
  })

  it("returns a seat only to the pass it was issued with, and never hands out the host's", () => {
    const game = startLanRound(seatGuest(lobby(), "guest"), NOW)

    expect(
      admitLanGuest(game, tokens, join("x", { key: "guest", token: "token-guest" }), unused),
    ).not.toHaveProperty("rejected")
    expect(
      admitLanGuest(game, tokens, join("x", { key: "guest", token: "guess" }), unused),
    ).toEqual({
      rejected: "That seat belongs to another device.",
    })
    expect(
      admitLanGuest(game, tokens, join("x", { key: "host", token: "" }), unused),
    ).toHaveProperty("rejected")
  })

  it("lets the host change the seat count only in the lobby and never below the seated", () => {
    const seated = seatGuest(seatGuest(lobby({ ...commander, playerCount: 4 }), "a"), "b")

    expect(setLanPlayerCount(seated, 3).setup.playerCount).toBe(3)
    expect(setLanPlayerCount(seated, 2)).toBe(seated)
    expect(setLanPlayerCount(seated, 7)).toBe(seated)
    const playing = startLanRound(setLanPlayerCount(seated, 3), NOW)
    expect(setLanPlayerCount(playing, 4)).toBe(playing)
  })

  it("keeps guests that draw at most six seats out of bigger tables", () => {
    const big = lobby({ ...commander, playerCount: 8 })
    const current = { ...join("new"), maxSeats: 10 }

    expect(admitLanGuest(big, tokens, join("old"), unused)).toEqual({
      rejected: "Update Scryve to join this game.",
    })
    const seated = admitLanGuest(big, tokens, current, { key: "new", token: "t" })
    expect(seated).toHaveProperty("game.seats.1.key", "new")
    if ("rejected" in seated) return
    expect(setLanPlayerCount(seated.game, 10).setup.playerCount).toBe(10)
    const withOld = seatGuest(setLanPlayerCount(seated.game, 4), "old")
    expect(setLanPlayerCount(withOld, 7)).toBe(withOld)
  })

  it("is ready to start only when every chosen seat is filled and present", () => {
    const full = seatGuest(lobby(), "guest")

    expect(lanSeatsReady(lobby())).toBe(false)
    expect(lanSeatsReady(full)).toBe(true)
    expect(lanSeatsReady(setLanConnected(full, "guest", false))).toBe(false)
    expect(releaseLanSeat(full, "guest").seats.map((seat) => seat.key)).toEqual(["host"])
  })
})

describe("nearby Two-Headed Giant teams", () => {
  const twoHeaded: LanSetup = { ...commander, playerCount: 4, variant: "twoHeadedGiant" }
  const admit = (game: LanGame, key: string) => {
    const admitted = admitLanGuest(
      game,
      tokens,
      { ...join(key), variants: ["twoHeadedGiant"] },
      { key, token: `token-${key}` },
    )
    if ("rejected" in admitted) throw new Error(admitted.rejected)
    return admitted.game
  }
  const seatsOf = (game: LanGame) => game.seats.map(({ key, seat }) => [key, seat])

  it("lets the host trade seats in the lobby, an open one too, and the next guest fills the gap", () => {
    const traded = swapLanSeats(admit(lobby(twoHeaded), "bo"), 2, 3)
    expect(seatsOf(traded)).toEqual([
      ["host", 1],
      ["bo", 3],
    ])
    const full = admit(admit(traded, "cy"), "dee")
    expect(seatsOf(releaseLanSeat(full, "cy"))).toEqual([
      ["host", 1],
      ["bo", 3],
      ["dee", 4],
    ])
    expect(startLanRound(full, NOW).memory?.turnGroups).toEqual([
      ["host", "cy"],
      ["bo", "dee"],
    ])
    expect(swapLanSeats(startLanRound(full, NOW), 1, 2).seats).toEqual(
      startLanRound(full, NOW).seats,
    )
    expect(swapLanSeats(full, 1, 5)).toBe(full)
  })
})

describe("nearby Treachery", () => {
  const treachery: LanSetup = { ...commander, playerCount: 4, variant: "treachery" }
  const joinWithRoles = (name: string) => ({ ...join(name), variants: ["treachery"] }) as const
  // why: with a shuffle that always draws 0 the deal is host Traitor, a and b Assassins, c Leader.
  const alwaysFirst = () => 0
  const neverSwap = () => 0.99

  function table() {
    let game = lobby(treachery)
    for (const key of ["a", "b", "c"]) {
      const admitted = admitLanGuest(game, tokens, joinWithRoles(key), { key, token: key })
      if ("rejected" in admitted) throw new Error(admitted.rejected)
      game = admitted.game
    }
    return game
  }
  const playerOf = (game: LanGame, viewer: string, key: string) =>
    lanProjection(game, viewer).players.find((player) => player.playerId === key)

  it("turns away a guest whose build has no hidden roles, and keeps its seats in range", () => {
    expect(admitLanGuest(lobby(treachery), tokens, join("old"), unused)).toEqual({
      rejected: "Update Scryve to join this game.",
    })
    expect(setLanPlayerCount(lobby(treachery), 3).setup.playerCount).toBe(4)
    expect(lanSeatsReady({ ...table(), setup: { ...treachery, playerCount: 3 } })).toBe(false)
    expect(parseLanSetup({ ...treachery, variant: "chaos" })).not.toHaveProperty("variant")
    expect(parseLanSetup({ ...treachery, system: "lorcana", format: "core" })).not.toHaveProperty(
      "variant",
    )
  })

  it("shows each guest only its own role and the face-up Leader, never on the wire lobby", () => {
    const game = startLanRound(table(), NOW, alwaysFirst)

    expect(playerOf(game, "a", "a")).toMatchObject({ role: "assassin", roleRevealed: false })
    expect(playerOf(game, "a", "c")).toMatchObject({ role: "leader", roleRevealed: true })
    expect(playerOf(game, "a", "host")).not.toHaveProperty("role")
    expect(playerOf(game, "a", "b")).not.toHaveProperty("role")
    expect(JSON.stringify(lanLobbyOf(game))).not.toMatch(/assassin|traitor|leader/)
    expect(lanProjection(game, "a").variant).toBe("treachery")
  })

  it("shows every role once a round finishes, but not when the host abandons it", () => {
    const game = startLanRound(table(), NOW, alwaysFirst)

    expect(playerOf(endLanRound(game, "finished", NOW), "a", "b")?.role).toBe("assassin")
    expect(playerOf(endLanRound(game, "abandoned", NOW), "a", "b")).not.toHaveProperty("role")
  })

  it("deals again every round", () => {
    const first = startLanRound(table(), NOW, alwaysFirst)
    const next = startLanRound(endLanRound(first, "finished", NOW), NOW, neverSwap)

    expect(playerOf(next, "host", "host")?.role).toBe("leader")
    expect(playerOf(next, "a", "host")).toMatchObject({ role: "leader", roleRevealed: true })
  })

  it("reveals only the sender's own role, and only while the round is on", () => {
    const game = startLanRound(table(), NOW, alwaysFirst)
    const revealed = revealLanRole(game, "a", NOW)

    expect(parseGuestMessage(JSON.stringify({ type: "reveal" }))).toEqual({ type: "reveal" })
    expect(playerOf(revealed, "b", "a")).toMatchObject({ role: "assassin", roleRevealed: true })
    expect(playerOf(revealed, "b", "host")).not.toHaveProperty("role")
    expect(revealLanRole(table(), "a", NOW)).toEqual(table())
  })

  it("tells only the host who won once the rules decide it", () => {
    const game = startLanRound(table(), NOW, alwaysFirst)
    expect(lanProjection(game, "host").treacheryOutcome).toBeUndefined()

    const { next } = write(game, "c", life("life-operation-0003", "c", -40))

    expect(lanProjection(next, "host").treacheryOutcome).toEqual({
      kind: "win",
      winnerPlayerIds: ["a", "b"],
    })
    expect(lanProjection(next, "a").treacheryOutcome).toBeUndefined()
  })
})

describe("nearby decks", () => {
  const atraxa = { versionId: "version-atraxa", name: "Atraxa" }

  it("keeps a seat's deck through the lobby, lets it be cleared, and freezes it mid-round", () => {
    const hostReady = setLanDeck(seatGuest(lobby(), "guest"), "host", atraxa)

    expect(lanSeatsReady(hostReady)).toBe(true)
    expect(setLanDeck(hostReady, "host", null).seats[0]).not.toHaveProperty("deck")
    expect(setLanDeck(startLanRound(hostReady, NOW), "guest", atraxa).seats[1]).not.toHaveProperty(
      "deck",
    )
    expect(lanProjection(hostReady, "guest").players[0]).toMatchObject({
      deckVersionId: atraxa.versionId,
    })
  })

  it("starts a Flesh and Blood seat on its hero's health, and only there", () => {
    const fab = { ...commander, system: "fab", format: "cc", ruleset: "cc" } as const
    const hero = { versionId: "version-dorinthea", name: "Dorinthea", startingValue: 20 }
    const hostLife = (setup: LanSetup) =>
      lanProjection(startLanRound(setLanDeck(lobby(setup), "host", hero), NOW), "host").players[0]
        .currentLife

    expect(hostLife(fab)).toBe(20)
    expect(hostLife(commander)).toBe(40)
  })

  it("carries a shared deck's list fingerprint over the wire", () => {
    const shared = {
      versionId: "shared-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      name: "Borrowed",
      fingerprint: "v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }
    const game = setLanDeck(lobby(), "host", shared)
    const state = parseHostMessage(
      JSON.stringify({
        type: "state",
        lobby: lanLobbyOf(game),
        projection: lanProjection(game, "guest"),
      }),
    )
    expect(state).toMatchObject({ lobby: { seats: [{ deck: shared }] } })
  })

  it("carries seat decks over the wire, and drops a malformed deck", () => {
    const game = setLanDeck(lobby(), "host", atraxa)
    const state = parseHostMessage(
      JSON.stringify({
        type: "state",
        lobby: lanLobbyOf(game),
        projection: lanProjection(game, "guest"),
      }),
    )

    expect(state).toMatchObject({ lobby: { seats: [{ deck: atraxa }] } })
    expect(parseGuestMessage(JSON.stringify({ type: "deck", deck: atraxa }))).toEqual({
      type: "deck",
      deck: atraxa,
    })
    expect(parseGuestMessage(JSON.stringify({ type: "deck", deck: null }))).toEqual({
      type: "deck",
      deck: null,
    })
    expect(parseGuestMessage(JSON.stringify({ type: "deck", deck: { name: "No id" } }))).toBeNull()
  })
})

describe("nearby rounds on the shared engine", () => {
  it("applies a write as the sender's own seat, once, and lists it for the overlay", () => {
    const game = started()
    const { next, result } = write(game, "guest", life("life-operation-0001", "guest", -3))
    const replay = write(next, "guest", life("life-operation-0001", "guest", -3))

    expect(result).toMatchObject({ ok: true, ack: { deduplicated: false, currentLife: 37 } })
    expect(replay.result).toMatchObject({ ok: true, ack: { deduplicated: true } })
    expect(lifeOf(replay.next, "host", "guest")).toBe(37)
    expect(lanProjection(next, "guest").recentOperationIds).toEqual(["life-operation-0001"])
    expect(write(game, "guest", life("life-operation-0002", "host", -1)).result).toMatchObject({
      ok: false,
      error: { code: "seat_owner_required" },
    })
  })

  it("shows a commander claim only to its defender and applies the defender's confirm", () => {
    const claimed = write(
      started(),
      "host",
      op({
        type: "commanderDamage.submitted",
        operationId: "claim-operation-001",
        fromPlayerId: "host",
        toPlayerId: "guest",
        delta: 7,
      }),
    ).next

    expect(lanProjection(claimed, "guest").commanderDamage?.pendingClaims).toHaveLength(1)
    expect(lanProjection(claimed, "host").commanderDamage?.pendingClaims).toEqual([])

    const confirmed = write(
      claimed,
      "guest",
      op({
        type: "commanderDamage.resolved",
        operationId: "resolve-operation-1",
        claimOperationId: "claim-operation-001",
        toPlayerId: "guest",
        accepted: true,
      }),
    ).next

    expect(lifeOf(confirmed, "host", "guest")).toBe(33)
    expect(lanProjection(confirmed, "host").commanderDamage?.totals).toEqual([
      { fromPlayerId: "host", toPlayerId: "guest", total: 7 },
    ])
  })

  it("takes a confirmed claim back once when its undo names it", () => {
    const claim = (operationId: string, delta: number, undo = {}) =>
      op({
        type: "commanderDamage.submitted",
        operationId,
        fromPlayerId: "host",
        toPlayerId: "guest",
        delta,
        commanderLimit: 999,
        ...undo,
      })
    const confirm = (operationId: string, claimOperationId: string) =>
      op({
        type: "commanderDamage.resolved",
        operationId,
        claimOperationId,
        toPlayerId: "guest",
        accepted: true,
      })
    const undone = [
      claim("claim-operation-001", 7),
      confirm("resolve-operation-1", "claim-operation-001"),
      claim("claim-operation-002", -7, { undoOf: "claim-operation-001" }),
      confirm("resolve-operation-2", "claim-operation-002"),
    ].reduce(
      (game, event) =>
        write(game, event.type === "commanderDamage.resolved" ? "guest" : "host", event).next,
      started(),
    )

    expect(lifeOf(undone, "host", "guest")).toBe(40)
    expect(
      write(undone, "host", claim("claim-operation-003", -7, { undoOf: "claim-operation-001" }))
        .result,
    ).toMatchObject({ ok: false, error: { code: "invalid_undo" } })
  })

  it("declines a pre-999 guest's claim that would pull a total past 99 back down", () => {
    const claim = (operationId: string, delta: number, marker = {}) =>
      op({
        type: "commanderDamage.submitted",
        operationId,
        fromPlayerId: "host",
        toPlayerId: "guest",
        delta,
        ...marker,
      })
    const confirm = (operationId: string, claimOperationId: string) =>
      op({
        type: "commanderDamage.resolved",
        operationId,
        claimOperationId,
        toPlayerId: "guest",
        accepted: true,
      })
    const at120 = [
      claim("claim-operation-001", 120),
      confirm("resolve-operation-1", "claim-operation-001"),
    ].reduce(
      (game, event) =>
        write(game, event.type === "commanderDamage.resolved" ? "guest" : "host", event).next,
      started(),
    )
    const marked = claim("claim-operation-003", -21, { commanderLimit: 999 })

    expect(marked).toMatchObject({ commanderLimit: 999 })
    expect(write(at120, "host", claim("claim-operation-002", -21)).result).toMatchObject({
      ok: true,
      ack: { status: "declined" },
    })
    expect(write(at120, "host", marked).result).toMatchObject({
      ok: true,
      ack: { status: "pending" },
    })
  })

  it("keeps a partner's damage on its own total, apart from the first commander's", () => {
    const claim = (operationId: string, delta: number, partner = {}) =>
      op({
        type: "commanderDamage.submitted",
        operationId,
        fromPlayerId: "host",
        toPlayerId: "guest",
        delta,
        ...partner,
      })
    const confirm = (operationId: string, claimOperationId: string) =>
      op({
        type: "commanderDamage.resolved",
        operationId,
        claimOperationId,
        toPlayerId: "guest",
        accepted: true,
      })
    const claimed = [
      claim("claim-operation-001", 7),
      claim("claim-operation-002", 14, { commander: 1 }),
    ].reduce((game, event) => write(game, "host", event).next, started())

    expect(
      lanProjection(claimed, "guest").commanderDamage?.pendingClaims.map(
        ({ operationId, commander }) => [operationId, commander],
      ),
    ).toEqual([
      ["claim-operation-001", undefined],
      ["claim-operation-002", 1],
    ])

    const confirmed = [
      confirm("resolve-operation-1", "claim-operation-002"),
      confirm("resolve-operation-2", "claim-operation-001"),
    ].reduce((game, event) => write(game, "guest", event).next, claimed)
    const projection = lanProjection(confirmed, "host")

    expect(lifeOf(confirmed, "host", "guest")).toBe(19)
    expect(projection.commanderDamage).toMatchObject({
      totals: [
        { fromPlayerId: "host", toPlayerId: "guest", commander: 1, total: 14 },
        { fromPlayerId: "host", toPlayerId: "guest", total: 7 },
      ],
      eliminatedPlayerIds: [],
    })
  })

  it("moves Pokémon prizes to the taker when the owner records a knockout", () => {
    const pokemon = {
      ...commander,
      startingLife: 6,
      ruleset: "standard",
      system: "pokemon" as const,
      format: "standard",
    }
    const placed = write(
      started(pokemon),
      "host",
      op({
        type: "table.action",
        operationId: "table-operation-01",
        action: {
          kind: "pokemon.placed",
          playerId: "host",
          pokemonId: "charizard-001",
          slot: "active",
          card: { cardId: "sv03.5-006", name: "Charizard ex", hp: 330, prizes: 2 },
        },
      }),
    ).next
    const knockedOut = write(
      placed,
      "host",
      op({
        type: "table.action",
        operationId: "table-operation-02",
        action: {
          kind: "pokemon.knockedOut",
          playerId: "host",
          pokemonId: "charizard-001",
          takerPlayerId: "guest",
        },
      }),
    ).next

    expect(lifeOf(knockedOut, "guest", "guest")).toBe(4)
    expect(lanProjection(knockedOut, "guest").table?.players.host.pokemon?.active).toBeUndefined()
  })

  it("refuses writes before a round starts and after it ends", () => {
    const write1 = life("life-operation-0003", "guest", -1)

    expect(write(seatGuest(lobby(), "guest"), "guest", write1).result).toMatchObject({
      error: { code: "game_not_active" },
    })
    expect(write(endLanRound(started(), "finished", NOW), "guest", write1).result).toMatchObject({
      error: { code: "game_not_active" },
    })
  })

  it("refuses a write addressed to an earlier round", () => {
    const again = startLanRound(endLanRound(started(), "finished", NOW), NOW)

    expect(write(again, "guest", life("life-operation-0005", "guest", -1)).result).toMatchObject({
      error: { code: "game_not_active" },
    })
    expect(
      write(
        again,
        "guest",
        op({
          type: "life.changed",
          operationId: "life-operation-0006",
          playerId: "guest",
          delta: -1,
          gameId: "game-2",
        }),
      ).result,
    ).toMatchObject({ ok: true })
  })

  it("gives every round a new id and a fresh table", () => {
    const first = write(started(), "guest", life("life-operation-0004", "guest", -5)).next
    const again = startLanRound(endLanRound(first, "finished", NOW), NOW)

    expect(lanProjection(again, "host").publicId).not.toBe(lanProjection(first, "host").publicId)
    expect(lifeOf(again, "host", "guest")).toBe(40)
    expect(lanProjection(again, "host").recentOperationIds).toEqual([])
  })
})

describe("nearby seat marks", () => {
  it("gives every seat of a 7 to 10 seat game its own mark, and a 6 seat game the marks older apps draw", () => {
    const marks = (count: number) =>
      Array.from({ length: count }, (_, index) => lanSeatAppearance(index + 1, count).shape)
    expect(new Set(marks(10)).size).toBe(10)
    expect(marks(6)).toEqual(marks(10).slice(0, 6))
  })
})

describe("nearby messages", () => {
  it("drops malformed writes and tells an older host apart", () => {
    expect(
      parseGuestMessage(
        JSON.stringify({ type: "op", event: { type: "table.action", action: { kind: "nope" } } }),
      ),
    ).toBeNull()
    expect(parseGuestMessage(JSON.stringify({ type: "join", name: "old" }))).toMatchObject({
      protocol: 1,
    })
    expect(parseHostMessage(JSON.stringify({ type: "game", game: {} }))).toEqual({
      type: "outdated",
    })
  })

  it("carries a partner's slot and the host's partner flag, and drops a slot it doesn't know", () => {
    const claim = {
      type: "commanderDamage.submitted",
      operationId: "claim-operation-001",
      fromPlayerId: "host",
      toPlayerId: "guest",
      delta: 3,
    }
    const welcome = (fields: object) =>
      parseHostMessage(JSON.stringify({ type: "welcome", pass: unused, ...fields }))

    expect(op({ ...claim, commander: 1 })).toMatchObject({ commander: 1 })
    expect(() => op({ ...claim, commander: 2 })).toThrow("not an op")
    expect(welcome({ partners: true })).toEqual({ type: "welcome", pass: unused, partners: true })
    expect(welcome({})).toEqual({ type: "welcome", pass: unused })
    expect(welcome({ tableItems: ["xp", 3] })).toEqual({
      type: "welcome",
      pass: unused,
      tableItems: ["xp"],
    })
    expect(welcome({ turnedConditions: "yes" })).toEqual({ type: "welcome", pass: unused })
    expect(welcome({ turnedConditions: true })).toMatchObject({ turnedConditions: true })
  })

  it("reads an ack's claim status when the host sends one, and an older host's ack without it", () => {
    const ack = (fields: object) =>
      parseHostMessage(JSON.stringify({ type: "ack", operationId: "claim-1", ...fields }))

    expect(ack({})).toEqual({ type: "ack", operationId: "claim-1" })
    expect(ack({ status: "declined" })).toEqual({
      type: "ack",
      operationId: "claim-1",
      status: "declined",
    })
    expect(ack({ status: "lost" })).toEqual({ type: "ack", operationId: "claim-1" })
  })

  it("refuses a join with no usable name, and never cuts a name inside a character", () => {
    const join = (name: string) => parseGuestMessage(JSON.stringify({ type: "join", name }))

    expect(join("   ")).toBeNull()
    expect(join("\ud800")).toBeNull()
    expect(join("  Ada\udc00 ")).toMatchObject({ name: "Ada" })
    expect(join(`${"a".repeat(23)}😀`)).toMatchObject({ name: "a".repeat(23) })
  })

  it("carries the host's layout to every board and drops one it doesn't know", () => {
    const tabletop = { ...commander, playerCount: 4, layout: "tabletop" } as const

    expect(parseLanSetup(tabletop)).toEqual(tabletop)
    expect(parseLanSetup({ ...tabletop, layout: "spiral" })).toEqual({
      ...commander,
      playerCount: 4,
    })
    expect(lanProjection(lobby(tabletop), "guest").layout).toBe("tabletop")
  })
})

describe("nearby game log", () => {
  it("sends each guest the log on request, marking only its own changes and undos", () => {
    const tapped = write(started(), "guest", life("life-guest-tap-0001", "guest", -3)).next
    const { next, result } = write(
      tapped,
      "guest",
      op({
        type: "life.changed",
        operationId: "life-guest-undo-001",
        playerId: "guest",
        delta: 3,
        compensatesOperationId: "life-guest-tap-0001",
      }),
    )
    expect(result).toMatchObject({ ok: true })
    expect(parseGuestMessage(JSON.stringify({ type: "log" }))).toEqual({ type: "log" })

    const received = parseHostMessage(JSON.stringify({ type: "log", ...lanLog(next, "guest") }))
    expect(received).toMatchObject({
      type: "log",
      events: [
        { operationId: "life-guest-tap-0001", delta: -3, mine: true },
        { operationId: "life-guest-undo-001", undoOf: "life-guest-tap-0001", mine: true },
      ],
    })
    expect(lanLog(next, "host").events.some((event) => event.mine)).toBe(false)
  })

  it("starts the log over from a newest page that repeats nothing the guest holds", () => {
    const event = (index: number): ConnectedLogEvent => ({
      operationId: `log-op-${String(index).padStart(4, "0")}`,
      playerId: "guest",
      kind: "life.changed",
      delta: -1,
      clientCreatedAt: index,
    })
    const range = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, offset) => event(from + offset))
    const read = mergeLanLog(
      { events: range(1, 200), more: false },
      { events: range(401, 600), more: true },
    )
    expect(read.events.map(({ operationId }) => operationId)).toEqual(
      range(401, 600).map(({ operationId }) => operationId),
    )
    expect(read.more).toBe(true)
  })

  it("sends the newest changes that fit one line, and older ones page in after", () => {
    const game = started()
    const counterId = "c".repeat(300)
    for (let index = 0; index < 200; index += 1) {
      const operationId = `counter-op-${String(index).padStart(4, "0")}`
      game.memory?.events.set(operationId, {
        playerId: "guest",
        operationId,
        kind: "counter.changed",
        delta: 1,
        actionIdentity: JSON.stringify({
          kind: "counter.changed",
          playerId: "guest",
          counterId,
          delta: 1,
        }),
        actorUserId: "guest",
        clientCreatedAt: index + 1,
        serverCreatedAt: index + 1,
      })
    }

    const newest = lanLog(game, "guest")
    expect(encodeLine({ type: "log", ...newest }).length).toBeLessThanOrEqual(MAX_LINE_BYTES)
    expect(newest).toMatchObject({ more: true })
    expect(newest.events.at(-1)?.operationId).toBe("counter-op-0199")

    const older = lanLog(game, "guest", newest.events[0].operationId)
    const read = mergeLanLog(newest, older)
    expect(read.events.map(({ operationId }) => operationId)).toEqual(
      Array.from({ length: 200 }, (_, index) => `counter-op-${String(index).padStart(4, "0")}`),
    )
    expect(read.more).toBe(false)
  })
})

describe("clock pings", () => {
  it("reads a ping and its reply, and ignores ones without times", () => {
    expect(parseGuestMessage(JSON.stringify({ type: "ping", at: 5 }))).toEqual({
      type: "ping",
      at: 5,
    })
    expect(parseHostMessage(JSON.stringify({ type: "pong", at: 5, hostAt: 9 }))).toEqual({
      type: "pong",
      at: 5,
      hostAt: 9,
    })
    expect(parseGuestMessage(JSON.stringify({ type: "ping", at: "soon" }))).toBeNull()
    expect(parseHostMessage(JSON.stringify({ type: "pong", at: 5 }))).toBeNull()
    expect(
      parseGuestMessage(JSON.stringify({ type: "stats", stats: { ping: 3, ack: { count: "x" } } })),
    ).toEqual({ type: "stats", stats: { ping: 3 } })
  })
})

describe("nearby tap timing", () => {
  const tapped = (event: ConnectedActionEvent, tappedAt: unknown) => {
    const message = parseGuestMessage(JSON.stringify({ type: "op", event, tappedAt }))
    if (message?.type !== "op") throw new Error("not an op")
    return message
  }

  it("carries a guest's tap time to every other device, and says when it changed another seat", () => {
    const message = tapped(life("op-own-000000001", "guest", -2), NOW - 40)
    const own = applyLanWrite(started(), "guest", message.event, NOW, message.tappedAt).game
    expect(lanProjection(own, "host").lastChange).toEqual({ tappedAt: NOW - 40, crossSeat: false })
    expect(lanProjection(own, "guest").lastChange).toBeUndefined()

    const claim = op({
      type: "commanderDamage.submitted",
      operationId: "op-claim-0000001",
      fromPlayerId: "guest",
      toPlayerId: "host",
      delta: 3,
    })
    const cross = applyLanWrite(own, "guest", claim, NOW, NOW - 25).game
    expect(lanProjection(cross, "host").lastChange).toEqual({ tappedAt: NOW - 25, crossSeat: true })
  })

  it("plays a change whose tap time is missing or malformed, with nothing to time", () => {
    const message = tapped(life("op-bad-tap-00001", "guest", -1), "soon")
    expect(message).not.toHaveProperty("tappedAt")
    const { next, result } = write(started(), "guest", message.event)
    expect(result.ok).toBe(true)
    expect(lanProjection(next, "host").lastChange).toBeUndefined()
  })
})

describe("nearby games where anyone edits any seat", () => {
  const updated = (game: LanGame, key: string) => {
    const pass = { key, token: `token-${key}` }
    const admitted = admitLanGuest(game, tokens, { ...join(key), editsAnySeat: true }, pass)
    if ("rejected" in admitted) throw new Error(admitted.rejected)
    return admitted.game
  }

  it("lets a guest change the host's life when every seat's app supports it", () => {
    const game = startLanRound(updated(lobby(), "guest"), NOW)
    expect(lanProjection(game, "guest").lifeEditing).toBe("anyone")
    const { next, result } = write(game, "guest", life("op-anyone-000001", "host", -4))
    expect(result.ok).toBe(true)
    expect(lifeOf(next, "guest", "host")).toBe(36)
  })

  it("plays owner-only when a guest's app is too old, and names that guest", () => {
    const game = started()
    expect(lanProjection(game, "host").lifeEditing).toBeUndefined()
    expect(lanProjection(game, "host").players.map((player) => player.editsAnySeat)).toEqual([
      true,
      undefined,
    ])
    const { result } = write(game, "guest", life("op-owner-0000001", "host", -4))
    expect(result).toMatchObject({ ok: false, error: { code: "seat_owner_required" } })
  })

  it("reads the flag from join and welcome messages and keeps it on the wire lobby", () => {
    const joinMessage = parseGuestMessage(JSON.stringify({ ...join("guest"), editsAnySeat: true }))
    expect(joinMessage).toMatchObject({ editsAnySeat: true })
    const welcome = parseHostMessage(
      JSON.stringify({ type: "welcome", pass: unused, editsAnySeat: true }),
    )
    expect(welcome).toMatchObject({ editsAnySeat: true })
    const wire = parseHostMessage(
      JSON.stringify({
        type: "state",
        lobby: lanLobbyOf(updated(lobby(), "guest")),
        projection: lanProjection(started(), "host"),
      }),
    )
    expect(wire?.type === "state" && wire.lobby.seats.map((seat) => seat.editsAnySeat)).toEqual([
      true,
      true,
    ])
  })
})

describe("nearby Planechase and Archenemy", () => {
  it("broadcasts only revealed cards, and turns away guests that can't play the modes", () => {
    const setup: LanSetup = {
      ...commander,
      playerCount: 3,
      startingLife: 20,
      ruleset: "constructed",
      format: "constructed",
      variant: "archenemy",
      modeSetup: {
        archenemy: { seat: 1, deck: "e01-archenemy-nicol-bolas" },
        planechase: { decks: ["pc12-chaos-reigns"] },
      },
    }
    const older = admitLanGuest(lobby(setup), tokens, join("older"), unused)
    expect(older).toEqual({ rejected: expect.any(String) })
    let game = lobby(setup)
    for (const key of ["guest-a", "guest-b"]) {
      const admitted = admitLanGuest(
        game,
        tokens,
        { ...join(key), variants: ["archenemy", "planechase"] },
        { key, token: `token-${key}` },
      )
      if ("rejected" in admitted) throw new Error(admitted.rejected)
      game = admitted.game
    }
    const round = startLanRound(game, NOW)
    const authority = round.memory?.modes
    expect(authority?.archenemy?.order).toHaveLength(20)
    const modes = lanProjection(round, "guest-a").table?.modes
    expect(JSON.stringify(modes)).not.toContain("order")
    expect(modes?.planechase?.faceUp).toBe(authority?.planechase?.order?.[0])
    expect(modes?.archenemy).toEqual({ playerId: "host", deck: "e01-archenemy-nicol-bolas" })
  })

  it("keeps modes only where Convex would start them", () => {
    const archenemy: LanSetup = {
      ...commander,
      playerCount: 3,
      variant: "archenemy",
      modeSetup: { archenemy: { seat: 1 } },
    }
    expect(parseLanSetup(archenemy)).toEqual(archenemy)
    const lorcana = { system: "lorcana", format: "core" }
    expect(
      parseLanSetup({ ...commander, ...lorcana, modeSetup: { planechase: {} } }),
    ).not.toHaveProperty("modeSetup")
    expect(parseLanSetup({ ...archenemy, ...lorcana })).not.toHaveProperty("modeSetup")
    const { modeSetup: _, ...noSetup } = archenemy
    expect(parseLanSetup(noSetup)).not.toHaveProperty("variant")
  })

  it("keeps a rolled archenemy's seat in a rematch and reshuffles only the decks", () => {
    let game = lobby({
      ...commander,
      playerCount: 3,
      startingLife: 20,
      ruleset: "constructed",
      format: "constructed",
      variant: "archenemy",
      modeSetup: { archenemy: { deck: "e01-archenemy-nicol-bolas" } },
    })
    for (const key of ["guest-a", "guest-b"]) {
      const admitted = admitLanGuest(
        game,
        tokens,
        { ...join(key), variants: ["archenemy", "planechase"] },
        { key, token: `token-${key}` },
      )
      if ("rejected" in admitted) throw new Error(admitted.rejected)
      game = admitted.game
    }
    const first = startLanRound(game, NOW, () => 0.99)
    expect(first.memory?.modes?.archenemy?.playerId).toBe("guest-b")

    const rematch = startLanRound(endLanRound(first, "finished", NOW), NOW, () => 0)
    expect(rematch.memory?.modes?.archenemy?.playerId).toBe("guest-b")
    expect(rematch.memory?.modes?.archenemy?.order).not.toEqual(
      first.memory?.modes?.archenemy?.order,
    )
  })
})

describe("nearby Riftbound 2v2", () => {
  const twoVsTwo: LanSetup = {
    playerCount: 4,
    startingLife: 0,
    lifeStep: 1,
    ruleset: "constructed",
    system: "riftbound",
    format: "constructed",
    variant: "twoVsTwo",
  }
  const joinFrom = (key: string, variants: string[]) =>
    admitLanGuest(
      lobby(twoVsTwo),
      tokens,
      { ...join(key), systems: ["riftbound"], variants },
      { key, token: `token-${key}` },
    )

  it("turns away a guest whose build predates it, and keeps it to Riftbound at 4 seats", () => {
    expect(joinFrom("old", ["treachery", "archenemy", "twoHeadedGiant"])).toEqual({
      rejected: "Update Scryve to join this game.",
    })
    expect(joinFrom("new", ["twoVsTwo"])).not.toHaveProperty("rejected")
    expect(setLanPlayerCount(lobby(twoVsTwo), 6).setup.playerCount).toBe(4)
    expect(parseLanSetup(twoVsTwo)).toEqual(twoVsTwo)
    expect(parseLanSetup({ ...twoVsTwo, playerCount: 6 })).not.toHaveProperty("variant")
    expect(parseLanSetup({ ...commander, playerCount: 4, variant: "twoVsTwo" })).not.toHaveProperty(
      "variant",
    )
  })
})

describe("a nearby match", () => {
  const hostWins = (game: LanGame) => {
    const finished = lanLocalGame(game, { result: { kind: "win", winnerPlayerIds: ["host"] } })
    return {
      finished,
      next: { ...endLanRound(game, "finished", NOW), match: lanMatchAfter(game.match!, finished) },
    }
  }

  it("carries the score between rounds, shows it to every seat and ends on enough wins", () => {
    const first = started({ ...commander, matchBestOf: 3 })
    expect(lanProjection(first, "guest").match).toEqual({
      bestOf: 3,
      gameNumber: 1,
      seats: [
        { seat: 1, gamesWon: 0, gamesDrawn: 0 },
        { seat: 2, gamesWon: 0, gamesDrawn: 0 },
      ],
    })

    const one = hostWins(first)
    expect(one.finished.match).toMatchObject({ gameNumber: 1, wins: [0, 0] })
    expect(one.finished.match?.result).toBeUndefined()
    expect(lanProjection(one.next, "guest").match).toMatchObject({
      gameNumber: 1,
      seats: [{ gamesWon: 1 }, { gamesWon: 0 }],
    })
    const second = startLanRound(one.next, NOW)
    expect(second.match?.id).toBe(first.match?.id)
    expect(lanProjection(second, "guest").match).toMatchObject({
      gameNumber: 2,
      seats: [{ gamesWon: 1 }, { gamesWon: 0 }],
    })
    expect(lanProjection(second, "guest").match).not.toHaveProperty("canEnd")
    expect(lanProjection(second, "host").match).toMatchObject({ canEnd: true })
    const touched = write(
      second,
      "host",
      op({
        type: "life.changed",
        gameId: "game-2",
        operationId: "operation-match-life-1",
        playerId: "host",
        delta: -1,
      }),
    ).next
    expect(lanProjection(touched, "host").match).not.toHaveProperty("canEnd")

    const two = hostWins(touched)
    expect(two.finished.match).toMatchObject({
      gameNumber: 2,
      wins: [1, 0],
      result: { outcomes: ["win", "loss"] },
    })
    const fresh = startLanRound(two.next, NOW)
    expect(fresh.match?.id).not.toBe(first.match?.id)
    expect(fresh.match).toMatchObject({ gameNumber: 1, wins: [0, 0] })
  })

  it("keeps the host's best-of through the setup the lobby route parses", () => {
    const sent = JSON.parse(JSON.stringify({ ...commander, matchBestOf: 3 }))
    expect(parseLanSetup(sent)).toMatchObject({ matchBestOf: 3 })
    expect(parseLanSetup({ ...commander, matchBestOf: 4 })).not.toHaveProperty("matchBestOf")
  })

  it("starts over when the host calls it early or the seats change", () => {
    const second = startLanRound(hostWins(started({ ...commander, matchBestOf: 3 })).next, NOW)
    expect(endLanMatch(second, NOW).match).toMatchObject({ gameNumber: 1, wins: [0, 0] })
    const swapped = startLanRound(swapLanSeats(hostWins(second).next, 1, 2), NOW)
    expect(swapped.match).toMatchObject({ gameNumber: 1, wins: [0, 0] })
  })
})
