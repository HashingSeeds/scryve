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

export const gameRecapValidator = v.object({
  lives: v.optional(v.array(v.array(v.number()))),
  outs: v.optional(v.array(recapOutValidator)),
})

export type GameRecap = Infer<typeof gameRecapValidator>
export type RecapOut = Infer<typeof recapOutValidator>

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
}

export function buildRecap({
  seats,
  changes,
  teams,
  outs = [],
}: {
  seats: readonly RecapSeat[]
  changes: readonly RecapChange[]
  teams?: TurnGroups
  outs?: readonly RecapOut[]
}): GameRecap | undefined {
  const undone = new Set(changes.flatMap(({ undoOf }) => undoOf ?? []))
  const rows = [seats.map(({ startingLife }) => startingLife)]
  let previous: { playerId: string; sign: number } | undefined
  for (const change of changes) {
    if (change.undoOf !== undefined || undone.has(change.id) || change.delta === 0) continue
    const moved = new Set([change.playerId, ...teammatesOf(teams, change.playerId)])
    if (!seats.some(({ id }) => moved.has(id))) continue
    const last = rows[rows.length - 1]
    const next = last.map((life, seat) => (moved.has(seats[seat].id) ? life + change.delta : life))
    const sign = Math.sign(change.delta)
    if (rows.length > 1 && previous?.playerId === change.playerId && previous.sign === sign)
      rows[rows.length - 1] = next
    else rows.push(next)
    previous = { playerId: change.playerId, sign }
  }
  const final = rows[rows.length - 1]
  const explained = rows.length > 1 && final.every((life, seat) => life === seats[seat].life)
  if (!explained && outs.length === 0) return undefined
  return {
    ...(explained ? { lives: thinned(rows) } : {}),
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
  const outs = (Array.isArray(recap.outs) ? recap.outs.filter(isOut) : []).filter(
    (out, index, all) => all.findIndex(({ seat }) => seat === out.seat) === index,
  )
  if (!lives && outs.length === 0) return undefined
  return { ...(lives ? { lives } : {}), ...(outs.length > 0 ? { outs } : {}) }
}
