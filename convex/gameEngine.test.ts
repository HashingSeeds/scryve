import { ConvexError } from "convex/values"

import { makeConvexTest, type ConvexTestHarness } from "../test/convexTest"
import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { engineGameOf, type EngineError } from "./lib/gameEngine"
import {
  writeMemoryGame,
  type MemoryAck,
  type MemoryGame,
  type MemoryWrite,
} from "./lib/gameEngineMemory"
import type { TableAction } from "./lib/table"

const token = "t".repeat(43)
const HOST_DEVICE = "device-host-0001"
const JOINER_DEVICE = "device-joiner-0002"
const CREATED_AT = 1_700_000_000_000

type Seat = "host" | "joiner"
type Outcome = { ok: true; ack: MemoryAck } | { ok: false; error: EngineError }

async function parityGame(
  t: ConvexTestHarness,
  setup: { system: string; format: string; startingLife: number },
) {
  const host = t.withIdentity({ subject: "parity-host" })
  await host.mutation(api.users.syncCurrent, { displayName: "Host" })
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
  })
  const joiner = t.withIdentity({ subject: "parity-joiner" })
  await joiner.mutation(api.users.syncCurrent, { displayName: "Joiner" })
  await joiner.mutation(api.games.claimSeat, {
    token,
    displayName: "Joiner",
    color: "#2563EB",
    deviceId: JOINER_DEVICE,
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
            })
          : write.kind === "table"
            ? await client.mutation(api.games.tableAction, { ...base, action: write.action })
            : write.kind === "commander.claim"
              ? await client.mutation(api.games.submitCommanderDamage, {
                  ...base,
                  fromPlayerId: write.fromPlayerId as Id<"gamePlayers">,
                  toPlayerId: write.toPlayerId as Id<"gamePlayers">,
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
    if (convex.ok || engine.ok) expect(engine).toEqual(convex)
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
      pokemon?: unknown
    }) => ({
      currentLife: seat.currentLife,
      eventCount: seat.eventCount ?? 0,
      counters: seat.counters,
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
    expect(
      [...memory.pairs.entries()].map(([key, pair]) => [key.replace("\u0000", ">"), pair.total]),
    ).toEqual(stored.pairs.map((pair) => [`${pair.fromPlayerId}>${pair.toPlayerId}`, pair.total]))
  }

  return {
    hostSeat: hostRow._id as string,
    joinerSeat: joinerRow._id as string,
    write,
    end,
    expectSameState,
  }
}

const sent = (operationId: string, deviceId = HOST_DEVICE) => ({
  operationId,
  deviceId,
  clientCreatedAt: CREATED_AT,
})

const commander = { system: "mtg", format: "commander", startingLife: 40 }

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
