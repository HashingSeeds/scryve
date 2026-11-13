import {
  applyGameCommand,
  applyLocalTableAction,
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  clampedCommanderDelta,
  COMMANDER_SLOTS,
  commanderDamageBetween,
  createLocalGame,
  localOutReason,
  localRules,
  startTurnOnChange,
} from "./domain"
import { defaultStartingLife, type PlaySystemId } from "./playSystems"
import type { LocalGame } from "./types"
import { commanderField } from "../../../convex/lib/gameRules"
import { SYSTEMS } from "../../../convex/lib/systems/definitions"
import type { TableAction } from "../../../convex/lib/table"
import type { ModeSetup } from "../../../convex/lib/tableModes"
import { TWO_VS_TWO, type TeamVariant } from "../../../convex/lib/teamVariants"
import { nextTurnSeat } from "../../../convex/lib/turns"
import { TWO_HEADED_GIANT } from "../../../convex/lib/twoHeadedGiant"

const DEVICE = "device-table-0001"
const START = 1_700_000_000_000
const SEEDS = Number(process.env.PARITY_SEEDS ?? 3)
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
        kind: "planar.rolled",
        playerId,
        face: pick(["blank", "planeswalk", "chaos"] as const),
      },
    }),
    () => ({
      kind: "table",
      action: {
        kind: pick(["planar.walked", "planar.reset", "scheme.revealed"] as const),
        playerId,
      },
    }),
    () => ({
      kind: "table",
      action: { kind: "scheme.abandoned", playerId, card: pick([0, 1, 2]) },
    }),
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

const TEAMS = [
  [0, 1],
  [2, 3],
]

interface Table {
  seats: number
  teamVariant?: TeamVariant
  modeSetup?: ModeSetup
}

const TABLES: Partial<Record<PlaySystemId, readonly Table[]>> = {
  mtg: [
    { seats: 4, teamVariant: TWO_HEADED_GIANT },
    { seats: 4, modeSetup: { planechase: {}, archenemy: {} } },
  ],
  riftbound: [{ seats: 4, teamVariant: TWO_VS_TWO }],
}

function apply(game: LocalGame, step: Step, operationId: string, now: number, engine: boolean) {
  localRules.engine = engine
  if (step.kind === "table") return applyLocalTableAction(game, step.action, { operationId, now })
  const changed = applyGameCommand(
    game,
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
    {
      actorId: asActorId("table"),
      deviceId: asDeviceId(DEVICE),
      now: () => now,
      operationId: () => asOperationId(operationId),
    },
  )
  // why: the local hook starts a waiting turn after a change, outside the reducer.
  return changed === game ? game : startTurnOnChange(changed, now)
}

const ordered = (_key: string, value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
    : value

const EMPTY: Partial<LocalGame> = { logOrder: [] }

const differing = (old: LocalGame, engine: LocalGame) =>
  (Object.keys({ ...old, ...engine }) as (keyof LocalGame)[]).filter(
    (key) =>
      JSON.stringify(old[key] ?? EMPTY[key], ordered) !==
      JSON.stringify(engine[key] ?? EMPTY[key], ordered),
  )

function settled(step: Step, old: LocalGame, engine: LocalGame, now: number) {
  const fields = differing(old, engine)
  // why: the old rules reverse the full amount of a change that landed clamped, taking a floored counter below its floor.
  if (step.kind === "life.undo" && fields.every((key) => key === "players")) return "floored undo"
  // why: the engine starts a waiting turn on a change that moves nothing, and the old rules do not.
  if (
    old.turn?.waiting &&
    differing(startTurnOnChange(old, now), engine).every((key) => key === "updatedAt")
  )
    return "waiting turn started"
  return undefined
}

function play(system: PlaySystemId, format: string, table: Table, seed: number) {
  const rng = random(seed)
  let old = createLocalGame({
    gameId: asGameId("parity-game"),
    now: START,
    system,
    format,
    startingLife: defaultStartingLife(system, format, table.seats),
    players: Array.from({ length: table.seats }, (_, index) => ({
      name: `P${index}`,
      color: "#7C3AED",
    })),
    ...(table.teamVariant ? { teams: TEAMS, teamVariant: table.teamVariant } : {}),
    ...(table.modeSetup ? { modeSetup: table.modeSetup } : {}),
  })
  const lifeOperations: string[] = []
  const commanderHits: CommanderHit[] = []
  const history: string[] = []
  const found: { kind: string; settled?: string; detail?: unknown }[] = []

  for (let index = 0; index < STEPS; index++) {
    const step = nextStep(rng, system, old, lifeOperations, commanderHits)
    const operationId = `operation-${seed}-${String(index).padStart(6, "0")}`
    const now = START + (index + 1) * 1000
    history.push(JSON.stringify(step))
    const engine = apply(old, step, operationId, now, true)
    old = apply(old, step, operationId, now, false)
    if (step.kind === "life") lifeOperations.push(operationId)
    if (step.kind === "commander") commanderHits.push({ ...step, operationId })
    const fields = differing(old, engine)
    if (fields.length === 0) continue
    const known = settled(step, old, engine, now)
    found.push({
      kind: `${stepKind(step)} | ${known ?? fields.join(",")}`,
      settled: known,
      detail: {
        step,
        old: Object.fromEntries(fields.map((key) => [key, old[key]])),
        engine: Object.fromEntries(fields.map((key) => [key, engine[key]])),
        lastSteps: history.slice(-4),
      },
    })
    if (!known) break
    // why: a settled difference would otherwise hide everything after it, so the game carries on from the engine's board.
    old = engine
  }
  return found
}

afterAll(() => {
  localRules.engine = true
})

it("plays random local games the same on the old rules and on the shared engine, apart from two settled differences", () => {
  const counts = new Map<string, number>()
  const findings: unknown[] = []
  let games = 0
  for (const system of Object.keys(SYSTEMS) as PlaySystemId[])
    for (const { id: format } of SYSTEMS[system].formats)
      for (const table of [{ seats: 2 }, { seats: 4 }, ...(TABLES[system] ?? [])])
        for (let seed = 1; seed <= SEEDS; seed++) {
          games++
          for (const difference of play(system, format, table, seed * 7919 + table.seats)) {
            const key = `${system} ${format} ${table.teamVariant ?? (table.modeSetup ? "modes" : "")} | ${difference.kind}`
            counts.set(key, (counts.get(key) ?? 0) + 1)
            if (!difference.settled && findings.length < 3)
              findings.push({ key, ...(difference.detail as object) })
          }
        }
  const settledCounts = new Map<string, number>()
  for (const [key, count] of counts) {
    const kind = key.split(" | ").at(-1) ?? key
    settledCounts.set(kind, (settledCounts.get(kind) ?? 0) + count)
  }
  process.stdout.write(
    `\n${games} games\n${[...settledCounts].map(([kind, count]) => `${String(count).padStart(6)}  ${kind}`).join("\n")}\n`,
  )
  expect(findings).toEqual([])
})
