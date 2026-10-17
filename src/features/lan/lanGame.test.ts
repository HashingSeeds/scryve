import {
  admitLanGuest,
  applyLanWrite,
  createLanGame,
  endLanRound,
  LAN_PROTOCOL,
  lanProjection,
  lanSeatsReady,
  parseGuestMessage,
  parseHostMessage,
  releaseLanSeat,
  setLanConnected,
  startLanRound,
  type LanGame,
  type LanSeatPass,
  type LanSetup,
} from "./lanGame"
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

  it("is ready to start only when every chosen seat is filled and present", () => {
    const full = seatGuest(lobby(), "guest")

    expect(lanSeatsReady(lobby())).toBe(false)
    expect(lanSeatsReady(full)).toBe(true)
    expect(lanSeatsReady(setLanConnected(full, "guest", false))).toBe(false)
    expect(releaseLanSeat(full, "guest").seats.map((seat) => seat.key)).toEqual(["host"])
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

  it("refuses a join with no usable name, and never cuts a name inside a character", () => {
    const join = (name: string) => parseGuestMessage(JSON.stringify({ type: "join", name }))

    expect(join("   ")).toBeNull()
    expect(join("\ud800")).toBeNull()
    expect(join("  Ada\udc00 ")).toMatchObject({ name: "Ada" })
    expect(join(`${"a".repeat(23)}😀`)).toMatchObject({ name: "a".repeat(23) })
  })
})
