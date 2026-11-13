import {
  applyGameCommand,
  applyLocalTableAction,
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  clampedCommanderDelta,
  MAX_COMMANDER_DAMAGE,
  COMMANDER_SLOTS,
  commanderDamageBetween,
  createLocalGame,
  localOutReason,
  startTurnOnChange,
} from "./domain"
import { defaultStartingLife, type PlaySystemId } from "./playSystems"
import type { LocalGame } from "./types"
import {
  commanderTotals,
  writeMemoryGame,
  type MemoryGame,
} from "../../../convex/lib/gameEngineMemory"
import { commanderField } from "../../../convex/lib/gameRules"
import { SYSTEMS } from "../../../convex/lib/systems/definitions"
import { seatTable, type PlayerTable, type TableAction } from "../../../convex/lib/table"
import { TWO_VS_TWO, type TeamVariant } from "../../../convex/lib/teamVariants"
import { nextTurnSeat } from "../../../convex/lib/turns"
import { TWO_HEADED_GIANT } from "../../../convex/lib/twoHeadedGiant"

const DEVICE = "device-table-0001"
const START = 1_700_000_000_000
const SEEDS = Number(process.env.PARITY_SEEDS ?? 40)
const STEPS = Number(process.env.PARITY_STEPS ?? 120)
const SKIP = new Set((process.env.PARITY_SKIP ?? "").split(",").filter(Boolean))

interface CommanderHit {
  operationId: string
  from: string
  to: string
  slot: (typeof COMMANDER_SLOTS)[number]
  delta: number
}

type Step =
  | { kind: "life"; playerId: string; delta: number }
  | { kind: "life.undo"; of: string }
  | { kind: "commander.undo"; of: CommanderHit }
  | {
      kind: "commander"
      from: string
      to: string
      slot: (typeof COMMANDER_SLOTS)[number]
      delta: number
    }
  | { kind: "table"; action: TableAction }

function random(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]
  return { next, pick }
}

const stepKind = (step: Step) => (step.kind === "table" ? step.action.kind : step.kind)

function nextStep(
  rng: ReturnType<typeof random>,
  system: PlaySystemId,
  local: LocalGame,
  lifeOperations: readonly string[],
  commanderHits: readonly CommanderHit[],
): Step {
  const { pick } = rng
  const ids = local.players.map(({ id }) => id as string)
  const playerId = pick(ids)
  const other = pick(ids)
  const table = SYSTEMS[system].table
  const pokemonId = pick(["p1", "p2", "p3"])
  const card = { hp: pick([60, 120, 330]), prizes: pick([1, 2, 3]) }
  const turn = local.turn
  const choices: (() => Step)[] = [
    () => ({ kind: "life", playerId, delta: pick([-1, 1, -5, 5, -10, 10, -1000, 1000, -9000]) }),
    () => ({ kind: "life", playerId, delta: pick([-1, 1, -3, 7]) }),
    () => ({
      kind: "life.undo",
      of: pick(lifeOperations.length ? lifeOperations : ["none-0000000000000000"]),
    }),
    () => {
      // why: the board trims a correction to the damage on record before sending it.
      const slot = pick(COMMANDER_SLOTS)
      const delta = clampedCommanderDelta(
        commanderDamageBetween(local, playerId as never, other as never, slot),
        pick([1, 2, 5, 21, -1, -3, 120]),
      )
      return { kind: "commander", from: playerId, to: other, slot, delta }
    },
    () =>
      commanderHits.length
        ? { kind: "commander.undo", of: pick(commanderHits) }
        : { kind: "life", playerId, delta: 1 },
    () => ({
      kind: "table",
      action: {
        kind: "counter.changed",
        playerId,
        counterId: pick([...table.counters.map(({ id }) => id), "bogus"]),
        delta: pick([1, -1, 2, 10, -10, 200]),
      },
    }),
    () => ({
      kind: "table",
      action: {
        kind: "customCounter.changed",
        playerId,
        name: pick(["Storm", "storm", "Treasure", " "]),
        delta: pick([1, -1, 5, -5]),
      },
    }),
    () => ({
      kind: "table",
      action: {
        kind: pick(["designation.taken", "designation.released"] as const),
        playerId,
        designationId: pick([...table.designations.map(({ id }) => id), "bogus"]),
      },
    }),
    () => ({ kind: "table", action: { kind: "turn.started", playerId } }),
    () => ({
      kind: "table",
      action: {
        kind: "turn.passed",
        playerId: turn?.playerId ?? playerId,
        toPlayerId: process.env.PARITY_ANY_PASS
          ? other
          : // why: the local board names the next seat still in the game, as the engine does for itself.
            (nextTurnSeat(
              ids,
              turn?.playerId ?? playerId,
              (id) => localOutReason(local, id as never) !== undefined,
              local.turnGroups,
            ) ?? "nobody"),
      },
    }),
    () => ({ kind: "table", action: { kind: "turn.set", playerId, toPlayerId: other } }),
    () => ({
      kind: "table",
      action: {
        kind: "turn.undone",
        playerId,
        turnOperationId: turn?.operationId ?? "none-0000000000000000",
      },
    }),
    () => ({
      kind: "table",
      action: { kind: "turn.clock", playerId, bankMs: pick([undefined, 60_000, 0]) },
    }),
    () => ({
      kind: "table",
      action: {
        kind: "pokemon.placed",
        playerId,
        pokemonId,
        slot: pick(["active", "bench"] as const),
        card,
      },
    }),
    () => ({ kind: "table", action: { kind: "pokemon.updated", playerId, pokemonId, card } }),
    () => ({
      kind: "table",
      action: {
        kind: "pokemon.damaged",
        playerId,
        pokemonId,
        delta: pick([10, 30, -10, 400]),
        ...(rng.next() < 0.5 ? { takerPlayerId: other } : {}),
      },
    }),
    () => ({ kind: "table", action: { kind: "pokemon.switched", playerId, pokemonId } }),
    () => ({ kind: "table", action: { kind: "pokemon.removed", playerId, pokemonId } }),
    () => ({
      kind: "table",
      action: { kind: "pokemon.knockedOut", playerId, pokemonId, takerPlayerId: other },
    }),
    () => ({
      kind: "table",
      action: {
        kind: "pokemon.knockoutUndone",
        playerId,
        knockoutOperationId:
          local.table?.players[playerId]?.pokemon?.lastKnockout?.operationId ??
          "none-0000000000000000",
      },
    }),
    () => ({
      kind: "table",
      action: {
        kind: "pokemon.conditionChanged",
        playerId,
        pokemonId,
        condition: pick(["poisoned", "burned", "asleep", "confused", "paralyzed"] as const),
        on: rng.next() < 0.7,
      },
    }),
    () => ({
      kind: "table",
      action: {
        kind: "pokemon.checkedUp",
        playerId,
        pokemonId,
        ...(rng.next() < 0.6 ? { coin: pick(["heads", "tails"] as const) } : {}),
        takerPlayerId: other,
      },
    }),
  ]
  for (;;) {
    const step = pick(choices)()
    // why: local play applies commander damage in any format and the engine refuses it outside Commander; the board only offers it in Commander.
    if (
      step.kind === "commander" &&
      (local.format !== "commander" || step.delta === 0 || step.from === step.to)
    )
      continue
    // why: with every other seat out, the board offers no pass.
    if (
      step.kind === "table" &&
      step.action.kind === "turn.passed" &&
      step.action.toPlayerId === "nobody"
    )
      continue
    if (!SKIP.has(stepKind(step))) return step
  }
}

const tidyTable = (seat: PlayerTable) => {
  const { counters, customCounters, pokemon } = seatTable(seat)
  const kept = Object.entries(counters ?? {}).filter(([, value]) => value !== 0)
  return {
    counters: Object.fromEntries(kept.sort(([a], [b]) => a.localeCompare(b))),
    customCounters: customCounters ?? [],
    pokemon: pokemon ?? null,
  }
}

function snapshot(game: {
  lives: number[]
  commander: number[]
  tables: PlayerTable[]
  designations: Record<string, string>
  turn: unknown
}) {
  return {
    lives: game.lives,
    commander: game.commander,
    tables: game.tables.map(tidyTable),
    designations: game.designations,
    turn: game.turn ?? null,
  }
}

const TEAMS = [
  [0, 1],
  [2, 3],
]

function play(
  system: PlaySystemId,
  format: string,
  seats: number,
  seed: number,
  teamVariant?: TeamVariant,
) {
  const rng = random(seed)
  let local = createLocalGame({
    gameId: asGameId("parity-game"),
    now: START,
    system,
    format,
    startingLife: defaultStartingLife(system, format, seats),
    players: Array.from({ length: seats }, (_, index) => ({ name: `P${index}`, color: "#7C3AED" })),
    ...(teamVariant ? { teams: TEAMS, teamVariant } : {}),
  })
  const ids = local.players.map(({ id }) => id as string)
  const memory: MemoryGame = {
    status: "active",
    system: local.system,
    format: local.format,
    designations: {},
    lifeEditing: "anyone",
    ...(local.variant ? { variant: local.variant, turnGroups: local.turnGroups } : {}),
    seats: new Map(local.players.map(({ id, life }) => [id, { id, currentLife: life }])),
    events: new Map(),
    claims: new Map(),
    pairs: new Map(),
  }
  const pairs = ids.flatMap((from) =>
    ids
      .filter((to) => to !== from)
      .flatMap((to) => COMMANDER_SLOTS.map((slot) => ({ from, to, slot }))),
  )
  const lifeOperations: string[] = []
  const commanderHits: CommanderHit[] = []
  const history: string[] = []

  for (let index = 0; index < STEPS; index++) {
    const step = nextStep(rng, system, local, lifeOperations, commanderHits)
    const operationId = `operation-${seed}-${String(index).padStart(6, "0")}`
    const now = START + (index + 1) * 1000
    const request = { operationId, deviceId: DEVICE, clientCreatedAt: now }
    const context = {
      actorId: asActorId("table"),
      deviceId: asDeviceId(DEVICE),
      now: () => now,
      operationId: () => asOperationId(operationId),
    }
    history.push(JSON.stringify(step))

    if (step.kind === "table")
      local = applyLocalTableAction(local, step.action, { operationId, now })
    else {
      const before = local
      local = applyGameCommand(
        local,
        step.kind === "life"
          ? { type: "life.change", playerId: step.playerId as never, delta: step.delta }
          : step.kind === "life.undo"
            ? { type: "life.undo", operationId: asOperationId(step.of) }
            : step.kind === "commander.undo"
              ? { type: "life.undo", operationId: asOperationId(step.of.operationId) }
              : {
                  type: "commanderDamage.assign",
                  fromPlayerId: step.from as never,
                  toPlayerId: step.to as never,
                  ...commanderField(step.slot),
                  delta: step.delta,
                },
        context,
      )
      // why: the local hook starts a waiting turn after a change, outside the reducer.
      if (local !== before) local = startTurnOnChange(local, now)
    }

    const undone = step.kind === "life.undo" ? memory.events.get(step.of) : undefined
    const result = writeMemoryGame(
      memory,
      { userId: "table", isHost: true },
      step.kind === "table"
        ? { kind: "table", action: step.action, ...request }
        : step.kind === "life"
          ? { kind: "life", playerId: step.playerId, delta: step.delta, ...request }
          : step.kind === "life.undo"
            ? {
                kind: "life",
                playerId: undone?.playerId ?? ids[0],
                delta: -(undone?.delta ?? 1),
                undoOf: step.of,
                ...request,
              }
            : step.kind === "commander.undo"
              ? {
                  kind: "commander.claim",
                  commanderLimit: MAX_COMMANDER_DAMAGE,
                  fromPlayerId: step.of.from,
                  toPlayerId: step.of.to,
                  ...commanderField(step.of.slot),
                  delta: -step.of.delta,
                  undoOf: step.of.operationId,
                  ...request,
                }
              : {
                  kind: "commander.claim",
                  commanderLimit: MAX_COMMANDER_DAMAGE,
                  fromPlayerId: step.from,
                  toPlayerId: step.to,
                  ...commanderField(step.slot),
                  delta: step.delta,
                  ...request,
                },
      now,
    )
    if (step.kind === "life") lifeOperations.push(operationId)
    if (step.kind === "commander") commanderHits.push({ ...step, operationId })

    const totals = commanderTotals(memory)
    const left = snapshot({
      lives: local.players.map(({ life }) => life),
      commander: pairs.map(({ from, to, slot }) =>
        commanderDamageBetween(local, from as never, to as never, slot),
      ),
      tables: ids.map((id) => local.table?.players[id] ?? {}),
      designations: local.table?.designations ?? {},
      turn: local.turn,
    })
    const right = snapshot({
      lives: ids.map((id) => memory.seats.get(id)?.currentLife ?? NaN),
      commander: pairs.map(
        ({ from, to, slot }) =>
          totals.find(
            (pair) =>
              pair.fromPlayerId === from && pair.toPlayerId === to && pair.commander === slot,
          )?.total ?? 0,
      ),
      tables: ids.map((id) => memory.seats.get(id) ?? {}),
      designations: memory.designations,
      turn: memory.turn,
    })
    const fields = (Object.keys(left) as (keyof typeof left)[]).filter(
      (key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]),
    )
    if (fields.length > 0)
      return {
        kind: stepKind(step),
        fields,
        step,
        engine: result.ok ? "accepted" : result.error.message,
        local: Object.fromEntries(fields.map((key) => [key, left[key]])),
        memory: Object.fromEntries(fields.map((key) => [key, right[key]])),
        lastSteps: history.slice(-4),
      }
  }
  return null
}

const TEAM_VARIANTS: Partial<Record<PlaySystemId, readonly (readonly [4, TeamVariant])[]>> = {
  mtg: [[4, TWO_HEADED_GIANT]],
  riftbound: [[4, TWO_VS_TWO]],
}

it("lists where local play and the shared engine disagree", () => {
  const found = new Map<string, { count: number; example: unknown }>()
  let runs = 0
  for (const system of Object.keys(SYSTEMS) as PlaySystemId[])
    for (const { id: format } of SYSTEMS[system].formats)
      for (const [seats, variant] of [[2], [4], ...(TEAM_VARIANTS[system] ?? [])] as const)
        for (let seed = 1; seed <= SEEDS; seed++) {
          runs++
          const difference = play(system, format, seats, seed * 7919 + seats, variant)
          if (!difference) continue
          const key = `${system}${variant ? ` ${variant}` : ""} | ${difference.kind} | ${difference.fields.join(",")} | engine: ${difference.engine}`
          const entry = found.get(key)
          if (entry) entry.count++
          else found.set(key, { count: 1, example: { format, seats, ...difference } })
        }
  const rows = [...found].sort(([, a], [, b]) => b.count - a.count)
  process.stdout.write(
    `\n${runs} games, ${rows.reduce((sum, [, { count }]) => sum + count, 0)} ended apart\n` +
      rows.map(([key, { count }]) => `${String(count).padStart(5)}  ${key}`).join("\n") +
      "\n\n" +
      rows
        .filter(([key]) => key.includes(process.env.PARITY_SHOW ?? "\u0000"))
        .map(([key, { example }]) => `## ${key}\n${JSON.stringify(example, null, 1)}`)
        .join("\n") +
      "\n",
  )
})
