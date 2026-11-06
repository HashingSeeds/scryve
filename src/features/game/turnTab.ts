import type { Turn } from "../../../convex/lib/turns"

export const TURN_CLOCK_STYLES = ["stacked", "swap", "ring", "chess"] as const
export type TurnClockStyle = (typeof TURN_CLOCK_STYLES)[number]
export const TURN_PASS_STYLES = ["next", "label", "none"] as const
export type TurnPassStyle = (typeof TURN_PASS_STYLES)[number]
export const CHESS_BANK_MINUTES = [10, 20, 30] as const
/** why: from seven seats the seats beside the tab are too narrow for the round clock inside it, so it stays on the board's edge label. */
export const DENSE_TABLE_FROM = 7
/** why: a pass at a real table is noticed late, so its undo waits longer than other toasts. */
export const PASS_UNDO_MS = 15_000

export interface TurnTabPrefs {
  enabled: boolean
  clock: TurnClockStyle
  pass: TurnPassStyle
  hideOffered: boolean
}

export const DEFAULT_TURN_TAB_PREFS: TurnTabPrefs = {
  enabled: true,
  clock: "stacked",
  pass: "next",
  hideOffered: false,
}

export const isTurnClockStyle = (value: unknown): value is TurnClockStyle =>
  TURN_CLOCK_STYLES.some((style) => style === value)
export const isTurnPassStyle = (value: unknown): value is TurnPassStyle =>
  TURN_PASS_STYLES.some((style) => style === value)

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

/** why: a table that never passed a turn is the one sign the tab went unused, and the offer must come at most once per device so it never nags. */
export function offersToHideTurnTab(
  prefs: Pick<TurnTabPrefs, "enabled" | "hideOffered">,
  turn: Pick<Turn, "number"> | undefined,
) {
  return prefs.enabled && !prefs.hideOffered && turnsPassed(turn) === 0
}
