import { ConvexError } from "convex/values"

import { type ConvexTestHarness, makeConvexTest, signedIn } from "../test/convexTest"
import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  engineGameOf,
  runSync,
  type EngineError,
  type GameSteps,
  type GameAck as MemoryAck,
  type GameWrite as MemoryWrite,
} from "./lib/gameEngine"
import { commanderTotals, writeMemoryGame, type MemoryGame } from "./lib/gameEngineMemory"
import { connectedLogEvent } from "./lib/gameLog"
import {
  commanderField,
  PARTNER_COMMANDER,
  type CommanderSlot,
  type LifeEditing,
} from "./lib/gameRules"
import { TABLE_VERSION, type TableAction } from "./lib/table"

const token = "t".repeat(43)
const HOST_DEVICE = "device-host-0001"
const JOINER_DEVICE = "device-joiner-0002"
const CREATED_AT = 1_700_000_000_000

type Seat = "host" | "joiner"
type Outcome = { ok: true; ack: MemoryAck } | { ok: false; error: EngineError }

async function parityGame(
  t: ConvexTestHarness,
  setup: { system: string; format: string; startingLife: number; lifeEditing?: LifeEditing },
) {
  const editsAnySeat = setup.lifeEditing === "anyone" ? { editsAnySeat: true } : {}
  const host = await signedIn(t, "parity-host", "Host")
  const created = await host.mutation(api.games.createLobby, {
    publicId: "parity-game-public-01",
    playerCount: 2,
    startingLife: setup.startingLife,
    ruleset: setup.format,
    system: setup.system,
    format: setup.format,
    inviteToken: token,
    manualCodeCandidates: ["PAR234"],
    hostDisplayName: "Host",
    hostColor: "#7C3AED",
    deviceId: HOST_DEVICE,
    ...editsAnySeat,
  })
  const joiner = await signedIn(t, "parity-joiner", "Joiner")
  await joiner.mutation(api.games.claimSeat, {
    token,
    displayName: "Joiner",
    color: "#2563EB",
    deviceId: JOINER_DEVICE,
    ...editsAnySeat,
  })
  await host.mutation(api.games.startGame, { publicId: created.publicId })
  const { game, players } = await t.run(async (ctx) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_public_id", (q) => q.eq("publicId", created.publicId))
      .unique()
    if (!game) throw new Error("missing game")
    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect()
    return { game, players: players.sort((a, b) => a.seat - b.seat) }
  })
  const [hostRow, joinerRow] = players
  const memory: MemoryGame = {
    ...engineGameOf(game),
    seats: new Map(
      players.map((row) => [
        row._id,
        {
          id: row._id,
          ...(row.userId ? { userId: row.userId } : {}),
          ...(row.deviceId ? { deviceId: row.deviceId } : {}),
          currentLife: row.currentLife,
          eventCount: row.eventCount,
        },
      ]),
    ),
    events: new Map(),
    claims: new Map(),
    pairs: new Map(),
  }
  const clients = { host, joiner }
  const actors = {
    host: { userId: hostRow.userId!, isHost: true },
    joiner: { userId: joinerRow.userId!, isHost: false },
  }
  const publicId = created.publicId

  async function convexWrite(seat: Seat, write: MemoryWrite): Promise<Outcome> {
    const client = clients[seat]
    const base = {
      publicId,
      operationId: write.operationId,
      deviceId: write.deviceId,
      clientCreatedAt: write.clientCreatedAt,
    }
    try {
      const result =
        write.kind === "life"
          ? await client.mutation(api.games.changeLife, {
              ...base,
              playerId: write.playerId as Id<"gamePlayers">,
              delta: write.delta,
              ...(write.undoOf ? { undoOf: write.undoOf } : {}),
            })
          : write.kind === "table"
            ? await client.mutation(api.games.tableAction, {
                ...base,
                action: write.action,
                ...(write.undoOf ? { undoOf: write.undoOf } : {}),
              })
            : write.kind === "commander.claim"
              ? await client.mutation(api.games.submitCommanderDamage, {
                  ...base,
                  fromPlayerId: write.fromPlayerId as Id<"gamePlayers">,
                  toPlayerId: write.toPlayerId as Id<"gamePlayers">,
                  ...(write.commander === undefined ? {} : { commander: write.commander }),
                  delta: write.delta,
                })
              : await client.mutation(
                  write.decision === "confirmed"
                    ? api.games.confirmCommanderDamage
                    : api.games.declineCommanderDamage,
                  {
                    ...base,
                    ...(write.resolutionOperationId
                      ? { resolutionOperationId: write.resolutionOperationId }
                      : {}),
                  },
                )
      const { operationId, deduplicated } = result
      return {
        ok: true,
        ack: {
          operationId,
          deduplicated,
          ...("status" in result ? { status: result.status } : {}),
          ...("currentLife" in result && typeof result.currentLife === "number"
            ? { currentLife: result.currentLife }
            : {}),
          ...("total" in result && typeof result.total === "number" ? { total: result.total } : {}),
        },
      }
    } catch (cause) {
      if (cause instanceof ConvexError) {
        const data = cause.data as { code: EngineError["code"]; message: string }
        return { ok: false, error: { kind: "rejected", code: data.code, message: data.message } }
      }
      return { ok: false, error: { kind: "rejected", message: (cause as Error).message } }
    }
  }

  async function write(seat: Seat, request: MemoryWrite) {
    const convex = await convexWrite(seat, request)
    const engine = writeMemoryGame(memory, actors[seat], request, CREATED_AT)
    // why: submitCommanderDamage returns only the claim's status, even when the claim lands at once.
    const comparable =
      engine.ok && request.kind === "commander.claim"
        ? { ok: true, ack: { ...engine.ack, total: undefined, currentLife: undefined } }
        : engine
    if (convex.ok || engine.ok) expect(comparable).toEqual(convex)
    else {
      expect(engine.error.code).toBe(convex.error.code)
      expect(convex.error.message).toContain(engine.error.message)
    }
    return engine
  }

  async function end() {
    await host.mutation(api.games.finishGame, { publicId })
    memory.status = "finished"
  }

  async function expectSameState() {
    const stored = await t.run(async (ctx) => {
      const seats = await ctx.db
        .query("gamePlayers")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect()
      const events = await ctx.db
        .query("gameEvents")
        .withIndex("by_game_operation", (q) => q.eq("gameId", game._id))
        .collect()
      const claims = await ctx.db
        .query("gameCommanderClaims")
        .withIndex("by_game_operation", (q) => q.eq("gameId", game._id))
        .collect()
      const pairs = await ctx.db
        .query("gameCommanderDamage")
        .withIndex("by_game_and_pair", (q) => q.eq("gameId", game._id))
        .collect()
      const current = await ctx.db.get(game._id)
      return { seats, events, claims, pairs, designations: current?.designations ?? {} }
    })
    const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value))
    const byOperation = <Row extends { operationId: string }>(rows: Row[]) =>
      [...rows].sort((a, b) => a.operationId.localeCompare(b.operationId))
    const seatState = (seat: {
      currentLife: number
      eventCount?: number
      counters?: unknown
      customCounters?: unknown
      pokemon?: unknown
    }) => ({
      currentLife: seat.currentLife,
      eventCount: seat.eventCount ?? 0,
      counters: seat.counters,
      customCounters: seat.customCounters,
      pokemon: seat.pokemon,
    })
    expect(plain(memory.designations)).toEqual(plain(stored.designations))
    expect(plain([...memory.seats.values()].map(seatState))).toEqual(
      plain(stored.seats.sort((a, b) => a.seat - b.seat).map(seatState)),
    )
    expect(
      plain(
        byOperation([...memory.events.values()]).map(({ serverCreatedAt: _, ...event }) => event),
      ),
    ).toEqual(
      plain(
        byOperation(stored.events).map(
          ({
            _id,
            _creationTime,
            gameId: _game,
            serverCreatedAt: _at,
            sequence: _sequence,
            ...event
          }) => event,
        ),
      ),
    )
    expect(
      plain(
        byOperation([...memory.claims.values()]).map(({ createdAt: _, resolvedAt, ...claim }) => ({
          ...claim,
          resolved: resolvedAt !== undefined,
        })),
      ),
    ).toEqual(
      plain(
        byOperation(stored.claims).map(
          ({ _id, _creationTime, gameId: _game, createdAt: _at, resolvedAt, ...claim }) => ({
            ...claim,
            resolved: resolvedAt !== undefined,
          }),
        ),
      ),
    )
    const byPair = (
      pairs: {
        fromPlayerId: string
        toPlayerId: string
        commander?: CommanderSlot
        total: number
      }[],
    ) =>
      pairs
        .map(({ fromPlayerId, toPlayerId, commander, total }) => ({
          fromPlayerId,
          toPlayerId,
          ...commanderField(commander),
          total,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    expect(byPair(commanderTotals(memory))).toEqual(byPair(stored.pairs))
  }

  async function expectSameTurn() {
    const stored = await t.run(async (ctx) => (await ctx.db.get(game._id))?.turn)
    const holder = (turn: typeof stored) =>
      turn && {
        playerId: turn.playerId,
        number: turn.number,
        operationId: turn.operationId,
        waiting: turn.waiting,
        previous: turn.previous && [turn.previous.playerId, turn.previous.number],
      }
    expect(holder(memory.turn)).toEqual(holder(stored))
    return memory.turn
  }

  const projectedTurn = async (tableVersion?: number) =>
    (
      await joiner.query(api.games.lobbyProjection, {
        publicId,
        ...(tableVersion === undefined ? {} : { tableVersion }),
      })
    ).table?.turn

  const log = async (seat: Seat) =>
    (
      await clients[seat].query(api.games.connectedEvents, {
        publicId,
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).page

  return {
    log,
    hostSeat: hostRow._id as string,
    joinerSeat: joinerRow._id as string,
    write,
    end,
    expectSameState,
    expectSameTurn,
    projectedTurn,
  }
}

const sent = (operationId: string, deviceId = HOST_DEVICE) => ({
  operationId,
  deviceId,
  clientCreatedAt: CREATED_AT,
})

const commander = { system: "mtg", format: "commander", startingLife: 40 }

describe("runSync", () => {
  it("refuses a store read that returns a promise instead of reading it as missing", () => {
    function* steps(): GameSteps<boolean> {
      return (yield Promise.resolve(1)) === undefined
    }
    expect(() => runSync(steps())).toThrow("A synchronous game store returned a promise")
  })
})

describe("engine parity: changeLife", () => {
  it("applies, replays, and rejects the same writes Convex does", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const life = (operationId: string, delta: number, playerId = game.hostSeat) =>
      ({ kind: "life", playerId, delta, ...sent(operationId) }) as const

    expect(await game.write("host", life("life-operation-0001", -3))).toMatchObject({
      ok: true,
      ack: { deduplicated: false },
    })
    expect(await game.write("host", life("life-operation-0001", -3))).toMatchObject({
      ok: true,
      ack: { deduplicated: true },
    })
    await game.write("host", life("life-operation-0001", -4))
    await game.write("host", life("life-operation-0002", -1, game.joinerSeat))
    await game.write("host", life("life-operation-0003", 0))
    await game.write("host", life("bad", -1))
    await game.write("host", { ...life("life-operation-0004", -1), deviceId: "x" })
    await game.write("host", { ...life("life-operation-0005", -1), clientCreatedAt: -1 })
    await game.write("host", { ...life("life-operation-0006", -1), deviceId: "device-other-0003" })
    await game.expectSameState()
  })

  it("stops Yu-Gi-Oh! Life Points at 0 and replays the clamped change by what was sent", async () => {
    const game = await parityGame(makeConvexTest(), {
      system: "ygo",
      format: "advanced",
      startingLife: 8000,
    })
    const life = (operationId: string, delta: number) =>
      ({ kind: "life", playerId: game.hostSeat, delta, ...sent(operationId) }) as const

    await game.write("host", life("life-ygo-lethal-0001", -8500))
    await game.write("host", life("life-ygo-overkill-01", -1000))
    await game.write("host", life("life-ygo-lethal-0001", -8500))
    await game.write("host", life("life-ygo-overkill-01", -900))
    await game.expectSameState()
  })

  it("acknowledges a retry after the game ends but refuses a new change", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const life = (operationId: string) =>
      ({ kind: "life", playerId: game.hostSeat, delta: -2, ...sent(operationId) }) as const

    await game.write("host", life("life-before-end-001"))
    await game.end()

    expect(await game.write("host", life("life-before-end-001"))).toMatchObject({
      ok: true,
      ack: { deduplicated: true },
    })
    expect(await game.write("host", life("life-after-end-0001"))).toMatchObject({
      ok: false,
      error: { code: "game_not_active" },
    })
    await game.expectSameState()
  })
})

describe("engine parity: life undo", () => {
  it("takes back only the writer's own standing life change", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const life = (operationId: string, delta: number, undoOf?: string) =>
      ({
        kind: "life",
        playerId: game.hostSeat,
        delta,
        ...sent(operationId),
        ...(undoOf ? { undoOf } : {}),
      }) as const

    await game.write("host", life("life-undo-original-1", -3))
    await game.write("host", life("life-undo-missing-01", 3, "life-undo-nothing-01"))
    expect(
      await game.write("host", life("life-undo-takeback-1", 3, "life-undo-original-1")),
    ).toMatchObject({ ok: true })
    expect(
      await game.write("host", life("life-undo-of-undo-01", -3, "life-undo-takeback-1")),
    ).toMatchObject({ ok: false, error: { code: "invalid_undo" } })
    await game.expectSameState()

    const [undo, original] = await game.log("host")
    expect(undo).toMatchObject({ undoOf: "life-undo-original-1", mine: true })
    expect(original).toMatchObject({ operationId: "life-undo-original-1", mine: true })
    expect((await game.log("joiner")).some((event) => event.mine)).toBe(false)
  })

  it("reverses what the authority applied, not what the device asked for", async () => {
    const game = await parityGame(makeConvexTest(), {
      system: "ygo",
      format: "advanced",
      startingLife: 8000,
    })
    const life = (operationId: string, delta: number, undoOf?: string) =>
      ({
        kind: "life",
        playerId: game.hostSeat,
        delta,
        ...sent(operationId),
        ...(undoOf ? { undoOf } : {}),
      }) as const

    expect(await game.write("host", life("life-clamp-change-1", -9000))).toMatchObject({
      ack: { currentLife: 0 },
    })
    expect(
      await game.write("host", life("life-clamp-undo-001", 9000, "life-clamp-change-1")),
    ).toMatchObject({ ok: true, ack: { currentLife: 8000 } })
    await game.expectSameState()
  })

  it("takes a change back only once", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const life = (operationId: string, delta: number, undoOf?: string) =>
      ({
        kind: "life",
        playerId: game.hostSeat,
        delta,
        ...sent(operationId),
        ...(undoOf ? { undoOf } : {}),
      }) as const

    await game.write("host", life("life-once-change-01", -3))
    await game.write("host", life("life-once-undo-0001", 3, "life-once-change-01"))
    expect(
      await game.write("host", life("life-once-undo-0002", 3, "life-once-change-01")),
    ).toMatchObject({ ok: false, error: { code: "invalid_undo" } })
    await game.expectSameState()
  })
})

describe("engine parity: tableAction", () => {
  const table = (operationId: string, action: TableAction, deviceId?: string) =>
    ({ kind: "table", action, ...sent(operationId, deviceId) }) as const

  it("changes counters and designations and rejects the same writes Convex does", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const poison = {
      kind: "counter.changed",
      playerId: game.hostSeat,
      counterId: "poison",
      delta: 1,
    } as const

    await game.write("host", table("table-poison-00001", poison))
    await game.write("host", table("table-poison-00001", poison))
    await game.write("host", table("table-poison-00001", { ...poison, delta: 2 }))
    await game.write(
      "host",
      table("table-monarch-0001", {
        kind: "designation.taken",
        playerId: game.hostSeat,
        designationId: "monarch",
      }),
    )
    await game.write(
      "joiner",
      table(
        "table-monarch-0002",
        {
          kind: "designation.taken",
          playerId: game.joinerSeat,
          designationId: "monarch",
        },
        JOINER_DEVICE,
      ),
    )
    await game.write("joiner", table("table-poison-00002", poison, JOINER_DEVICE))
    await game.write("host", table("table-unknown-0001", { ...poison, counterId: "nope" }))
    await game.write("host", table("table-other-device-1", poison, "device-other-0003"))
    await game.expectSameState()
  })

  it("moves Pokémon prizes to the taker on a knockout and back on its undo", async () => {
    const game = await parityGame(makeConvexTest(), {
      system: "pokemon",
      format: "standard",
      startingLife: 6,
    })
    await game.write(
      "host",
      table("table-place-000001", {
        kind: "pokemon.placed",
        playerId: game.hostSeat,
        pokemonId: "charizard-001",
        slot: "active",
        card: { cardId: "sv03.5-006", name: "Charizard ex", hp: 330, prizes: 2 },
      }),
    )
    await game.write(
      "host",
      table("table-damage-00001", {
        kind: "pokemon.damaged",
        playerId: game.hostSeat,
        pokemonId: "charizard-001",
        delta: 120,
      }),
    )
    await game.write(
      "host",
      table("table-knockout-001", {
        kind: "pokemon.knockedOut",
        playerId: game.hostSeat,
        pokemonId: "charizard-001",
        takerPlayerId: game.joinerSeat,
      }),
    )
    await game.write(
      "host",
      table("table-knockout-002", {
        kind: "pokemon.knockedOut",
        playerId: game.hostSeat,
        pokemonId: "charizard-001",
        takerPlayerId: game.joinerSeat,
      }),
    )
    await game.write(
      "host",
      table("table-undo-0000001", {
        kind: "pokemon.knockoutUndone",
        playerId: game.hostSeat,
        knockoutOperationId: "table-knockout-001",
      }),
    )
    await game.expectSameState()
  })

  it("acknowledges a retry after the game ends but refuses a new action", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const poison = {
      kind: "counter.changed",
      playerId: game.hostSeat,
      counterId: "poison",
      delta: 1,
    } as const
    await game.write("host", table("table-before-end-01", poison))
    await game.end()

    expect(await game.write("host", table("table-before-end-01", poison))).toMatchObject({
      ok: true,
      ack: { deduplicated: true },
    })
    await game.write("host", table("table-after-end-001", poison))
    await game.expectSameState()
  })
})

describe("engine parity: turns", () => {
  const table = (operationId: string, action: TableAction, deviceId?: string) =>
    ({ kind: "table", action, ...sent(operationId, deviceId) }) as const

  it("passes, refuses the wrong seat, undoes, and hides the turn from older clients", async () => {
    const game = await parityGame(makeConvexTest(), {
      system: "ygo",
      format: "advanced",
      startingLife: 8000,
    })
    const { hostSeat, joinerSeat } = game
    await game.write(
      "joiner",
      table("turn-start-host-01", { kind: "turn.set", playerId: hostSeat, toPlayerId: hostSeat }),
    )
    await game.write(
      "host",
      table("turn-start-host-02", { kind: "turn.set", playerId: hostSeat, toPlayerId: hostSeat }),
    )
    expect(await game.expectSameTurn()).toMatchObject({ playerId: hostSeat, waiting: true })
    await game.write("joiner", {
      kind: "life",
      playerId: joinerSeat,
      delta: -1,
      ...sent("turn-life-joiner-01", JOINER_DEVICE),
    })
    expect(await game.expectSameTurn()).toMatchObject({ playerId: hostSeat })
    expect((await game.expectSameTurn())?.waiting).toBeUndefined()
    await game.write(
      "joiner",
      table(
        "turn-pass-joiner-1",
        { kind: "turn.passed", playerId: joinerSeat, toPlayerId: hostSeat },
        JOINER_DEVICE,
      ),
    )
    await game.write(
      "host",
      table("turn-pass-host-001", {
        kind: "turn.passed",
        playerId: hostSeat,
        toPlayerId: joinerSeat,
      }),
    )
    expect(await game.expectSameTurn()).toMatchObject({ playerId: joinerSeat, number: 2 })
    expect(await game.projectedTurn(TABLE_VERSION)).toMatchObject({ playerId: joinerSeat })
    expect(await game.projectedTurn(2)).toBeUndefined()
    expect(await game.projectedTurn()).toBeUndefined()

    await game.write(
      "joiner",
      table(
        "turn-undo-joiner-1",
        { kind: "turn.undone", playerId: hostSeat, turnOperationId: "turn-pass-host-001" },
        JOINER_DEVICE,
      ),
    )
    await game.write(
      "host",
      table("turn-undo-host-001", {
        kind: "turn.undone",
        playerId: hostSeat,
        turnOperationId: "turn-pass-host-001",
      }),
    )
    expect(await game.expectSameTurn()).toMatchObject({ playerId: hostSeat, number: 1 })
    await game.write(
      "joiner",
      table(
        "turn-bank-joiner-1",
        { kind: "turn.clock", playerId: joinerSeat, bankMs: 600_000 },
        JOINER_DEVICE,
      ),
    )
    expect(await game.projectedTurn(TABLE_VERSION)).toMatchObject({ bank: { ms: 600_000 } })
    await game.expectSameState()
  })
})

describe("engine parity: submitCommanderDamage", () => {
  it("records, replays, and declines claims the way Convex does", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const claim = (
      operationId: string,
      delta: number,
      from = game.hostSeat,
      to = game.joinerSeat,
    ) =>
      ({
        kind: "commander.claim",
        fromPlayerId: from,
        toPlayerId: to,
        delta,
        ...sent(operationId),
      }) as const

    expect(await game.write("host", claim("claim-operation-001", 7))).toMatchObject({
      ok: true,
      ack: { deduplicated: false },
    })
    await game.write("host", claim("claim-operation-001", 7))
    await game.write("host", claim("claim-operation-001", 8))
    await game.write("host", claim("claim-operation-002", 3))
    await game.write("host", claim("claim-operation-003", 3, game.joinerSeat, game.hostSeat))
    await game.write("host", claim("claim-operation-004", 3, game.hostSeat, game.hostSeat))
    await game.write("host", claim("claim-operation-005", 100))
    await game.write("host", {
      kind: "life",
      playerId: game.hostSeat,
      delta: -1,
      ...sent("shared-operation-01"),
    })
    await game.write("host", claim("shared-operation-01", 2))
    await game.expectSameState()
  })

  it("is only offered in Commander games", async () => {
    const game = await parityGame(makeConvexTest(), {
      system: "mtg",
      format: "standard",
      startingLife: 20,
    })
    await game.write("host", {
      kind: "commander.claim",
      fromPlayerId: game.hostSeat,
      toPlayerId: game.joinerSeat,
      delta: 5,
      ...sent("claim-standard-0001"),
    })
    await game.expectSameState()
  })

  it("checks the game is active before recognizing a retry", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const claim = {
      kind: "commander.claim",
      fromPlayerId: game.hostSeat,
      toPlayerId: game.joinerSeat,
      delta: 4,
      ...sent("claim-before-end-01"),
    } as const
    await game.write("host", claim)
    await game.end()

    expect(await game.write("host", claim)).toMatchObject({
      ok: false,
      error: { code: "game_not_active" },
    })
    await game.expectSameState()
  })
})

describe("engine parity: confirm and decline commander damage", () => {
  const resolve = (
    decision: "confirmed" | "declined",
    operationId: string,
    resolutionOperationId?: string,
  ) =>
    ({
      kind: "commander.resolve",
      decision,
      ...sent(operationId, JOINER_DEVICE),
      ...(resolutionOperationId ? { resolutionOperationId } : {}),
    }) as const

  async function claimed(operationId: string, delta: number) {
    const game = await parityGame(makeConvexTest(), commander)
    await game.write("host", {
      kind: "commander.claim",
      fromPlayerId: game.hostSeat,
      toPlayerId: game.joinerSeat,
      delta,
      ...sent(operationId),
    })
    return game
  }

  it("lets only the defender confirm, and binds and replays the resolution", async () => {
    const game = await claimed("claim-confirm-0001", 9)

    await game.write("host", {
      ...resolve("confirmed", "claim-confirm-0001"),
      deviceId: HOST_DEVICE,
    })
    await game.write("joiner", resolve("confirmed", "claim-confirm-0001", "resolve-confirm-01"))
    expect(
      await game.write("joiner", resolve("confirmed", "claim-confirm-0001", "resolve-confirm-01")),
    ).toMatchObject({ ok: true, ack: { deduplicated: true } })
    await game.write("joiner", resolve("declined", "claim-confirm-0001", "resolve-confirm-01"))
    await game.write("joiner", resolve("confirmed", "claim-confirm-0001", "resolve-confirm-02"))
    await game.write("joiner", resolve("confirmed", "claim-missing-00001"))
    await game.expectSameState()
  })

  it("declines without touching life and replays the legacy decline", async () => {
    const game = await claimed("claim-decline-0001", 5)

    await game.write("joiner", resolve("declined", "claim-decline-0001"))
    await game.write("joiner", resolve("declined", "claim-decline-0001"))
    await game.write("joiner", resolve("declined", "claim-decline-0001", "resolve-decline-01"))
    await game.expectSameState()
  })

  it("refuses a resolution id another claim already used", async () => {
    const game = await claimed("claim-first-000001", 2)
    await game.write("joiner", {
      kind: "commander.claim",
      fromPlayerId: game.joinerSeat,
      toPlayerId: game.hostSeat,
      delta: 3,
      ...sent("claim-second-00001", JOINER_DEVICE),
    })
    await game.write("joiner", resolve("confirmed", "claim-first-000001", "resolve-shared-001"))
    await game.write("host", {
      ...resolve("confirmed", "claim-second-00001", "resolve-shared-001"),
      deviceId: HOST_DEVICE,
    })
    await game.expectSameState()
  })

  it("replays a settled claim after the game ends but refuses a new resolution", async () => {
    const game = await claimed("claim-ended-000001", 6)
    await game.write("joiner", {
      kind: "commander.claim",
      fromPlayerId: game.joinerSeat,
      toPlayerId: game.hostSeat,
      delta: 1,
      ...sent("claim-ended-000002", JOINER_DEVICE),
    })
    await game.write("joiner", resolve("confirmed", "claim-ended-000001", "resolve-ended-0001"))
    await game.end()

    expect(
      await game.write("joiner", resolve("confirmed", "claim-ended-000001", "resolve-ended-0001")),
    ).toMatchObject({ ok: true, ack: { deduplicated: true } })
    await game.write("host", {
      ...resolve("confirmed", "claim-ended-000002"),
      deviceId: HOST_DEVICE,
    })
    await game.expectSameState()
  })
})

describe("engine parity: partner commanders", () => {
  it("keeps a partner's claims and totals apart from the first commander's", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const claim = (operationId: string, delta: number, slot?: CommanderSlot) =>
      game.write("host", {
        kind: "commander.claim",
        fromPlayerId: game.hostSeat,
        toPlayerId: game.joinerSeat,
        ...commanderField(slot),
        delta,
        ...sent(operationId),
      })
    const confirm = (operationId: string) =>
      game.write("joiner", {
        kind: "commander.resolve",
        decision: "confirmed",
        ...sent(operationId, JOINER_DEVICE),
      })

    expect(await claim("claim-first-commander", 5)).toMatchObject({ ack: { status: "pending" } })
    expect(await claim("claim-partner-commander", 6, PARTNER_COMMANDER)).toMatchObject({
      ack: { status: "pending" },
    })
    expect(await confirm("claim-first-commander")).toMatchObject({
      ack: { total: 5, currentLife: 35 },
    })
    expect(await confirm("claim-partner-commander")).toMatchObject({
      ack: { total: 6, currentLife: 29 },
    })
    await game.write("host", {
      kind: "commander.claim",
      fromPlayerId: game.hostSeat,
      toPlayerId: game.joinerSeat,
      commander: 2,
      delta: 1,
      ...sent("claim-unknown-commander"),
    })
    await game.expectSameState()
  })
})

describe("engine parity: anyone edits any seat", () => {
  it("lands commander damage the moment the claim arrives", async () => {
    const game = await parityGame(makeConvexTest(), { ...commander, lifeEditing: "anyone" })
    const claim = (operationId: string, delta: number, slot?: CommanderSlot) =>
      game.write("host", {
        kind: "commander.claim",
        fromPlayerId: game.hostSeat,
        toPlayerId: game.joinerSeat,
        ...commanderField(slot),
        delta,
        ...sent(operationId),
      })

    expect(await claim("claim-instant-000001", 7)).toEqual({
      ok: true,
      ack: {
        operationId: "claim-instant-000001",
        deduplicated: false,
        status: "confirmed",
        total: 7,
        currentLife: 33,
      },
    })
    expect(await claim("claim-instant-000001", 7)).toMatchObject({
      ack: { deduplicated: true, status: "confirmed" },
    })
    await claim("claim-instant-000002", 4, PARTNER_COMMANDER)
    await claim("claim-instant-000003", -2)
    await game.expectSameState()
  })
})

describe("memory engine: turn groups", () => {
  const seat = (id: string) => ({ id, userId: id, deviceId: `device-${id}`, currentLife: 40 })
  const tableWrite = (by: string, operationId: string, action: TableAction) =>
    ({
      kind: "table",
      action,
      operationId,
      deviceId: `device-${by}`,
      clientCreatedAt: CREATED_AT,
    }) as const
  const actor = (id: string) => ({ userId: id, isHost: id === "ada" })

  it("starts the first turn on another seat's commander damage, and lets either teammate pass", () => {
    const memory: MemoryGame = {
      status: "active",
      system: "mtg",
      format: "commander",
      designations: {},
      turnGroups: [
        ["ada", "bo"],
        ["cy", "dee"],
      ],
      seats: new Map(["ada", "bo", "cy", "dee"].map((id) => [id, seat(id)])),
      events: new Map(),
      claims: new Map(),
      pairs: new Map(),
    }
    const write = (by: string, operationId: string, action: TableAction, now = CREATED_AT) =>
      writeMemoryGame(memory, actor(by), tableWrite(by, operationId, action), now)

    expect(
      write("bo", "turn-claim-bo-0001", { kind: "turn.set", playerId: "bo", toPlayerId: "bo" }),
    ).toMatchObject({ ok: true })
    expect(memory.turn).toMatchObject({ playerId: "ada", waiting: true })

    writeMemoryGame(
      memory,
      actor("cy"),
      {
        kind: "commander.claim",
        fromPlayerId: "cy",
        toPlayerId: "dee",
        delta: 2,
        operationId: "claim-cy-dee-00001",
        deviceId: "device-cy",
        clientCreatedAt: CREATED_AT,
      },
      CREATED_AT + 5_000,
    )
    expect(memory.turn).toMatchObject({ playerId: "ada", startedAt: CREATED_AT + 5_000 })
    expect(memory.turn?.waiting).toBeUndefined()

    expect(
      write("cy", "turn-pass-cy-00001", { kind: "turn.passed", playerId: "cy", toPlayerId: "ada" }),
    ).toMatchObject({ ok: false })
    expect(
      write("bo", "turn-pass-bo-00001", { kind: "turn.passed", playerId: "bo", toPlayerId: "dee" }),
    ).toMatchObject({ ok: true })
    expect(memory.turn).toMatchObject({ playerId: "cy", number: 2, previous: { playerId: "ada" } })
    expect(
      write("ada", "turn-undo-ada-0001", {
        kind: "turn.undone",
        playerId: "ada",
        turnOperationId: "turn-pass-bo-00001",
      }),
    ).toMatchObject({ ok: true })
    expect(memory.turn).toMatchObject({ playerId: "ada", number: 1 })
  })

  it("lets no other seat claim, pass or take back a turn, even when anyone edits life", () => {
    const memory: MemoryGame = {
      status: "active",
      system: "mtg",
      format: "commander",
      designations: {},
      lifeEditing: "anyone",
      seats: new Map(["ada", "bo"].map((id) => [id, seat(id)])),
      events: new Map(),
      claims: new Map(),
      pairs: new Map(),
    }
    const asBo = (operationId: string, action: TableAction) =>
      writeMemoryGame(memory, actor("bo"), tableWrite("bo", operationId, action), CREATED_AT)

    expect(
      asBo("turn-claim-bo-0001", { kind: "turn.set", playerId: "ada", toPlayerId: "ada" }),
    ).toMatchObject({ ok: false, error: { code: "seat_owner_required" } })
    memory.turn = { playerId: "ada", number: 1, startedAt: CREATED_AT, operationId: "turn-ada" }
    expect(
      asBo("turn-pass-bo-00001", { kind: "turn.passed", playerId: "ada", toPlayerId: "bo" }),
    ).toMatchObject({ ok: false, error: { code: "seat_owner_required" } })
    memory.turn = {
      playerId: "bo",
      number: 2,
      startedAt: CREATED_AT,
      operationId: "turn-pass-ada",
      previous: { playerId: "ada", number: 1, startedAt: CREATED_AT, operationId: "turn-ada" },
    }
    expect(
      asBo("turn-undo-bo-00001", {
        kind: "turn.undone",
        playerId: "ada",
        turnOperationId: "turn-pass-ada",
      }),
    ).toMatchObject({ ok: false, error: { code: "seat_owner_required" } })
  })

  it("on a nearby host, passes to a 2HG team hit by 11 from a commander and 10 from its partner", () => {
    const memory: MemoryGame = {
      status: "active",
      system: "mtg",
      format: "commander",
      variant: "twoHeadedGiant",
      designations: {},
      turnGroups: [
        ["ada", "bo"],
        ["cy", "dee"],
      ],
      turn: { playerId: "cy", number: 1, startedAt: CREATED_AT, operationId: "turn-cy" },
      seats: new Map(
        ["ada", "bo", "cy", "dee"].map((id) => [id, { ...seat(id), currentLife: 60 }]),
      ),
      events: new Map(),
      claims: new Map(),
      pairs: new Map([
        [["cy", "ada"].join("\u0000"), { total: 11, updatedAt: CREATED_AT }],
        [["cy", "bo", "1"].join("\u0000"), { total: 10, updatedAt: CREATED_AT }],
      ]),
    }
    expect(
      writeMemoryGame(
        memory,
        actor("cy"),
        tableWrite("cy", "turn-pass-cy-00002", {
          kind: "turn.passed",
          playerId: "cy",
          toPlayerId: "ada",
        }),
        CREATED_AT + 1_000,
      ),
    ).toMatchObject({ ok: true })
    expect(memory.turn).toMatchObject({ playerId: "ada", number: 2 })
  })

  it("passes past a seat that went out after the passer's board last drew it", () => {
    const memory: MemoryGame = {
      status: "active",
      system: "mtg",
      format: "commander",
      designations: {},
      turn: { playerId: "ada", number: 1, startedAt: CREATED_AT, operationId: "turn-set-ada-0001" },
      seats: new Map(
        ["ada", "bo", "cy"].map((id) => [id, { ...seat(id), currentLife: id === "bo" ? 0 : 40 }]),
      ),
      events: new Map(),
      claims: new Map(),
      pairs: new Map(),
    }
    expect(
      writeMemoryGame(
        memory,
        actor("ada"),
        tableWrite("ada", "turn-pass-ada-0001", {
          kind: "turn.passed",
          playerId: "ada",
          toPlayerId: "bo",
        }),
        CREATED_AT + 1_000,
      ),
    ).toMatchObject({ ok: true })
    expect(memory.turn).toMatchObject({ playerId: "cy", number: 2 })
    expect(memory.events.get("turn-pass-ada-0001")).toMatchObject({ toPlayerId: "cy" })
  })

  it("names the seat the authority passed to in the log, not the one the device named", () => {
    const memory: MemoryGame = {
      status: "active",
      system: "mtg",
      format: "commander",
      designations: {},
      turn: { playerId: "ada", number: 1, startedAt: CREATED_AT, operationId: "turn-set-ada-0001" },
      seats: new Map(
        ["ada", "bo", "cy"].map((id) => [id, { ...seat(id), currentLife: id === "bo" ? 0 : 40 }]),
      ),
      events: new Map(),
      claims: new Map(),
      pairs: new Map(),
    }
    writeMemoryGame(
      memory,
      actor("ada"),
      tableWrite("ada", "turn-pass-ada-0002", {
        kind: "turn.passed",
        playerId: "ada",
        toPlayerId: "bo",
      }),
      CREATED_AT + 1_000,
    )
    const pass = memory.events.get("turn-pass-ada-0002")
    expect(pass && connectedLogEvent(pass, "ada").action).toEqual({
      kind: "turn.passed",
      playerId: "ada",
      toPlayerId: "cy",
    })
  })
})

describe("engine parity: counter undo", () => {
  it("records what a counter tap changed, and takes back only the same kind of change", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const poison = (operationId: string, delta: number, undoOf?: string) =>
      ({
        kind: "table",
        action: { kind: "counter.changed", playerId: game.hostSeat, counterId: "poison", delta },
        ...sent(operationId),
        ...(undoOf ? { undoOf } : {}),
      }) as const

    await game.write("host", poison("poison-floor-tap-01", -1))
    await game.write("host", poison("poison-tap-000001", 2))
    await game.write("host", {
      kind: "life",
      playerId: game.hostSeat,
      delta: 1,
      ...sent("life-wrong-undo-01"),
      undoOf: "poison-tap-000001",
    })
    expect(
      await game.write("host", poison("poison-undo-00001", -2, "poison-tap-000001")),
    ).toMatchObject({
      ok: true,
    })
    await game.expectSameState()
    const log = await game.log("host")
    expect(log.find((event) => event.operationId === "poison-floor-tap-01")?.delta).toBeUndefined()
    expect(log.find((event) => event.operationId === "poison-tap-000001")?.delta).toBe(2)
    expect(log.find((event) => event.operationId === "life-wrong-undo-01")).toBeUndefined()
  })

  it("takes back what a clamped counter tap changed, not what the device asked for", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const poison = (operationId: string, delta: number, undoOf?: string) =>
      ({
        kind: "table",
        action: { kind: "counter.changed", playerId: game.hostSeat, counterId: "poison", delta },
        ...sent(operationId),
        ...(undoOf ? { undoOf } : {}),
      }) as const

    await game.write("host", poison("poison-clamp-up-01", 1))
    await game.write("host", poison("poison-clamp-down1", -3))
    expect(
      await game.write("host", poison("poison-clamp-undo1", 3, "poison-clamp-down1")),
    ).toMatchObject({ ok: true })
    await game.expectSameState()
    const log = await game.log("host")
    expect(log.find((event) => event.operationId === "poison-clamp-undo1")?.delta).toBe(1)
  })

  it("takes back what a clamped named counter tap changed, not what the device asked for", async () => {
    const game = await parityGame(makeConvexTest(), commander)
    const speed = (operationId: string, delta: number, undoOf?: string) =>
      ({
        kind: "table",
        action: { kind: "customCounter.changed", playerId: game.hostSeat, name: "Speed", delta },
        ...sent(operationId),
        ...(undoOf ? { undoOf } : {}),
      }) as const

    await game.write("host", speed("speed-clamp-up-001", 1))
    await game.write("host", speed("speed-clamp-down01", -3))
    expect(
      await game.write("host", speed("speed-clamp-undo01", 3, "speed-clamp-down01")),
    ).toMatchObject({ ok: true })
    await game.expectSameState()
    const log = await game.log("host")
    expect(log.find((event) => event.operationId === "speed-clamp-undo01")?.delta).toBe(1)
  })
})

describe("memory engine: life undo", () => {
  it("refuses to take back another account's change on a table where anyone edits any seat", () => {
    const seat = (id: string) => ({ id, userId: id, deviceId: `device-${id}`, currentLife: 40 })
    const memory: MemoryGame = {
      status: "active",
      system: "mtg",
      format: "commander",
      designations: {},
      lifeEditing: "anyone",
      seats: new Map(["ada", "bo"].map((id) => [id, seat(id)])),
      events: new Map(),
      claims: new Map(),
      pairs: new Map(),
    }
    const life = (by: string, operationId: string, delta: number, undoOf?: string) =>
      writeMemoryGame(
        memory,
        { userId: by, isHost: by === "ada" },
        {
          kind: "life",
          playerId: "ada",
          delta,
          operationId,
          deviceId: `device-${by}`,
          clientCreatedAt: CREATED_AT,
          ...(undoOf ? { undoOf } : {}),
        },
        CREATED_AT,
      )

    life("bo", "life-by-bo-on-ada-001", -5)
    expect(life("ada", "life-ada-takes-back-1", 5, "life-by-bo-on-ada-001")).toMatchObject({
      ok: false,
      error: { code: "invalid_undo" },
    })
    expect(life("bo", "life-bo-takes-back-01", 5, "life-by-bo-on-ada-001")).toMatchObject({
      ok: true,
    })
    expect(memory.seats.get("ada")?.currentLife).toBe(40)
  })
})
