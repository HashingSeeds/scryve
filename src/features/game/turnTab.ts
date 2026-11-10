import type { Turn } from "../../../convex/lib/turns"

export const CHESS_BANK_MINUTES = [10, 20, 30] as const
export const PASS_UNDO_MS = 5_000

export function clockwiseSlots(rows: readonly (readonly (number | null)[])[]): number[] {
  const seated = rows.map((row) => row.filter((slot): slot is number => slot !== null))
  if (seated.length === 0) return []
  if (seated.length === 1) return [...seated[0]]
  const middle = seated.slice(1, -1)
  return [
    ...seated[0],
    ...middle.flatMap((row) => row.slice(-1)),
    ...[...seated[seated.length - 1]].reverse(),
    ...middle
      .filter((row) => row.length > 1)
      .map((row) => row[0])
      .reverse(),
  ]
}

export const turnsPassed = (turn: Pick<Turn, "number"> | undefined) =>
  Math.max(0, (turn?.number ?? 1) - 1)
