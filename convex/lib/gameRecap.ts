import { v, type Infer } from "convex/values"

import { MAX_SNAPSHOT_LIFE } from "./gameRules"
import type { OutReason } from "./outReason"
import type { TurnGroups } from "./turns"
import { teammatesOf } from "./twoHeadedGiant"

export const MAX_RECAP_ROWS = 240
const MAX_COUNTER_ID_LENGTH = 64

const recapOutValidator = v.union(
  v.object({
    seat: v.number(),
    cause: v.literal("commanderDamage"),
    from: v.number(),
    total: v.number(),
  }),
  v.object({
    seat: v.number(),
    cause: v.literal("counter"),
    counterId: v.string(),
    value: v.number(),
  }),
  v.object({ seat: v.number(), cause: v.literal("life") }),
)

// why: each step is the change that drew the next life row: whose life moved, on which turn, and whose commander dealt it.
const recapStepValidator = v.object({
  seat: v.number(),
  turn: v.optional(v.number()),
  from: v.optional(v.number()),
})

export const gameRecapValidator = v.object({
  lives: v.optional(v.array(v.array(v.number()))),
  steps: v.optional(v.array(recapStepValidator)),
  finishTurn: v.optional(v.number()),
  outs: v.optional(v.array(recapOutValidator)),
})

export type GameRecap = Infer<typeof gameRecapValidator>
export type RecapOut = Infer<typeof recapOutValidator>
export type RecapStep = Infer<typeof recapStepValidator>

export interface RecapSeat {
  id: string
  startingLife: number
  life: number
}

export interface RecapChange {
  id: string
  playerId: string
  delta: number
  undoOf?: string
  turn?: number
  from?: string
}

export function buildRecap({
  seats,
  changes,
  teams,
  outs = [],
  finishTurn,
}: {
  seats: readonly RecapSeat[]
  changes: readonly RecapChange[]
  teams?: TurnGroups
  outs?: readonly RecapOut[]
  finishTurn?: number
}): GameRecap | undefined {
  const undone = new Set(changes.flatMap(({ undoOf }) => undoOf ?? []))
  const seatOf = new Map(seats.map(({ id }, seat) => [id, seat]))
  const rows = [seats.map(({ startingLife }) => startingLife)]
  const steps: RecapStep[] = []
  let previous: (RecapChange & { sign: number }) | undefined
  for (const change of changes) {
    if (change.undoOf !== undefined || undone.has(change.id) || change.delta === 0) continue
    const moved = new Set([change.playerId, ...teammatesOf(teams, change.playerId)])
    const seat = seatOf.get(change.playerId) ?? seats.findIndex(({ id }) => moved.has(id))
    if (seat < 0) continue
    const last = rows[rows.length - 1]
    const next = last.map((life, index) =>
      moved.has(seats[index].id) ? life + change.delta : life,
    )
    const sign = Math.sign(change.delta)
    const from = change.from === undefined ? undefined : seatOf.get(change.from)
    if (
      rows.length > 1 &&
      previous?.playerId === change.playerId &&
      previous.sign === sign &&
      previous.turn === change.turn &&
      previous.from === change.from
    )
      rows[rows.length - 1] = next
    else {
      rows.push(next)
      steps.push({
        seat,
        ...(change.turn === undefined ? {} : { turn: change.turn }),
        ...(from === undefined ? {} : { from }),
      })
    }
    previous = { ...change, sign }
  }
  const final = rows[rows.length - 1]
  const explained = rows.length > 1 && final.every((life, seat) => life === seats[seat].life)
  if (!explained && outs.length === 0 && finishTurn === undefined) return undefined
  return {
    // why: thinned rows each fold several changes, so no single step explains them.
    ...(explained
      ? { lives: thinned(rows), ...(rows.length <= MAX_RECAP_ROWS ? { steps } : {}) }
      : {}),
    ...(finishTurn === undefined ? {} : { finishTurn }),
    ...(outs.length > 0 ? { outs: [...outs] } : {}),
  }
}

function thinned(rows: number[][]) {
  if (rows.length <= MAX_RECAP_ROWS) return rows
  return Array.from(
    { length: MAX_RECAP_ROWS },
    (_, index) => rows[Math.round((index * (rows.length - 1)) / (MAX_RECAP_ROWS - 1))],
  )
}

export function recapOuts<Id extends string>(
  seatIds: readonly Id[],
  losers: readonly Id[],
  reasonOf: (playerId: Id) => OutReason<Id> | undefined,
): RecapOut[] {
  return losers.flatMap((playerId): RecapOut[] => {
    const seat = seatIds.indexOf(playerId)
    const reason = reasonOf(playerId)
    if (seat < 0 || !reason) return []
    if (reason.cause === "counter")
      return [{ seat, cause: "counter", counterId: reason.counterId, value: reason.value }]
    if (reason.cause === "life") return [{ seat, cause: "life" }]
    const from = seatIds.indexOf(reason.fromPlayerId)
    return from < 0 ? [] : [{ seat, cause: "commanderDamage", from, total: reason.total }]
  })
}

const isLife = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= MAX_SNAPSHOT_LIFE

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

export function fittedRecap(recap: unknown, finalLives: readonly number[]): GameRecap | undefined {
  if (!isRecord(recap)) return undefined
  const seatCount = finalLives.length
  const isSeat = (seat: unknown): seat is number =>
    typeof seat === "number" && Number.isInteger(seat) && seat >= 0 && seat < seatCount
  const isRow = (row: unknown): row is number[] =>
    Array.isArray(row) && row.length === seatCount && row.every(isLife)
  const isOut = (out: unknown): out is RecapOut =>
    isRecord(out) &&
    isSeat(out.seat) &&
    (out.cause === "life" ||
      (out.cause === "commanderDamage"
        ? isSeat(out.from) && out.from !== out.seat && isLife(out.total)
        : out.cause === "counter" &&
          typeof out.counterId === "string" &&
          out.counterId.length > 0 &&
          out.counterId.length <= MAX_COUNTER_ID_LENGTH &&
          isLife(out.value)))
  const rows = recap.lives
  const lives =
    Array.isArray(rows) &&
    rows.length > 1 &&
    rows.length <= MAX_RECAP_ROWS &&
    rows.every(isRow) &&
    rows[rows.length - 1].every((life, seat) => life === finalLives[seat])
      ? rows
      : undefined
  const isTurn = (turn: unknown): turn is number =>
    typeof turn === "number" && Number.isInteger(turn) && turn > 0
  const isStep = (step: unknown): step is RecapStep =>
    isRecord(step) &&
    isSeat(step.seat) &&
    (step.turn === undefined || isTurn(step.turn)) &&
    (step.from === undefined || (isSeat(step.from) && step.from !== step.seat))
  const steps =
    lives &&
    Array.isArray(recap.steps) &&
    recap.steps.length === lives.length - 1 &&
    recap.steps.every(isStep)
      ? recap.steps
      : undefined
  const finishTurn = isTurn(recap.finishTurn) ? recap.finishTurn : undefined
  const outs = (Array.isArray(recap.outs) ? recap.outs.filter(isOut) : []).filter(
    (out, index, all) => all.findIndex(({ seat }) => seat === out.seat) === index,
  )
  if (!lives && outs.length === 0 && finishTurn === undefined) return undefined
  return {
    ...(lives ? { lives } : {}),
    ...(steps ? { steps } : {}),
    ...(finishTurn === undefined ? {} : { finishTurn }),
    ...(outs.length > 0 ? { outs } : {}),
  }
}
