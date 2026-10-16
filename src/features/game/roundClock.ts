import { translate } from "@/i18n/translate"
import { formatElapsed } from "@/utils/useElapsedSince"

import type { PlaySystemId } from "./playSystems"

/** why: a judge keeps the official time, so a countdown starts from the minutes left on the venue clock. */
export type RoundClockSetup = { mode: "stopwatch" } | { mode: "countdown"; minutes: number }

/** why: storing timestamps instead of ticks means the board saves only when someone changes the clock (see #452). Resume shifts `startedAt`, so elapsed time is always `(pausedAt ?? now) - startedAt`. */
export interface RoundClock {
  setup: RoundClockSetup
  startedAt: number
  pausedAt?: number
  adjustMs?: number
  /** why: set only when a judge calls time early; otherwise time is called when the countdown runs out. */
  calledAtMs?: number
  /** why: 0 is the turn in progress when time was called, which does not count toward the extra turns. */
  turn?: number
  bonusTurns?: number
}

export type RoundClockView =
  | { kind: "elapsed"; ms: number }
  | { kind: "remaining"; ms: number }
  | { kind: "time"; turn: number; turns: number; overtimeMs?: number }

export const ROUND_CLOCK_MINUTES = { min: 1, max: 180, step: 5 } as const

const MINUTE_MS = 60_000

/** why: MTR 2.5 and the Play! Pokémon handbook add turns after time; Yu-Gi-Oh! and unknown systems show only that time is up. */
const END_OF_ROUND_TURNS: Record<PlaySystemId, number> = { mtg: 5, pokemon: 3, ygo: 0 }

/** why: Play! Pokémon caps the end-of-round turns at 15 minutes for every table. */
const OVERTIME_MS: Partial<Record<PlaySystemId, number>> = { pokemon: 15 * MINUTE_MS }

export function defaultRoundClockMinutes(system: PlaySystemId | undefined, bestOf?: number) {
  return system === "pokemon" && (bestOf ?? 1) === 1 ? 30 : 50
}

export function isRoundClockSetup(value: unknown): value is RoundClockSetup {
  if (typeof value !== "object" || value === null || !("mode" in value)) return false
  if (value.mode === "stopwatch") return true
  return (
    value.mode === "countdown" &&
    "minutes" in value &&
    typeof value.minutes === "number" &&
    Number.isInteger(value.minutes) &&
    value.minutes >= ROUND_CLOCK_MINUTES.min &&
    value.minutes <= ROUND_CLOCK_MINUTES.max
  )
}

export function startRoundClock(setup: RoundClockSetup, now = Date.now()): RoundClock {
  return { setup, startedAt: now }
}

function elapsedMs(clock: RoundClock, now: number) {
  return Math.max(0, (clock.pausedAt ?? now) - clock.startedAt)
}

function durationMs(clock: RoundClock) {
  return clock.setup.mode === "countdown"
    ? Math.max(0, clock.setup.minutes * MINUTE_MS + (clock.adjustMs ?? 0))
    : undefined
}

export function roundClockView(
  clock: RoundClock,
  system: PlaySystemId | undefined,
  now = Date.now(),
): RoundClockView {
  const elapsed = elapsedMs(clock, now)
  const duration = durationMs(clock)
  if (duration === undefined) return { kind: "elapsed", ms: elapsed }
  const calledAt = clock.calledAtMs ?? (elapsed >= duration ? duration : undefined)
  if (calledAt === undefined) return { kind: "remaining", ms: duration - elapsed }
  const overtime = system ? OVERTIME_MS[system] : undefined
  return {
    kind: "time",
    turn: clock.turn ?? 0,
    turns: (system ? END_OF_ROUND_TURNS[system] : 0) + (clock.bonusTurns ?? 0),
    ...(overtime === undefined ? {} : { overtimeMs: Math.max(0, overtime - (elapsed - calledAt)) }),
  }
}

/** why: a countdown rounds up so it reads 0:00 only once time is actually up. */
export function formatRemaining(ms: number) {
  return formatElapsed(Math.ceil(ms / 1000) * 1000)
}

export type RoundTimeView = Extract<RoundClockView, { kind: "time" }>

/** why: Pokémon's overtime cap ends the procedure even when turns remain. */
export function areRoundTurnsDone(view: RoundTimeView) {
  return view.turn > view.turns || view.overtimeMs === 0
}

export function roundTurnText(view: RoundTimeView) {
  if (view.turns === 0) return ""
  if (areRoundTurnsDone(view)) return translate("board:roundClock.turnsDone")
  if (view.turn === 0) return translate("board:roundClock.finishTurn")
  return translate("board:roundClock.turnOf", { turn: view.turn, turns: view.turns })
}

export function roundClockText(view: RoundClockView) {
  if (view.kind === "elapsed") return formatElapsed(view.ms)
  if (view.kind === "remaining") return formatRemaining(view.ms)
  const turn = roundTurnText(view)
  return turn && view.overtimeMs !== undefined && !areRoundTurnsDone(view)
    ? `${turn} · ${formatRemaining(view.overtimeMs)}`
    : turn
}

export function isRoundClockTicking(clock: RoundClock, system: PlaySystemId | undefined) {
  if (clock.pausedAt !== undefined) return false
  const view = roundClockView(clock, system)
  return view.kind !== "time" || (view.overtimeMs ?? 0) > 0
}

export function pauseRoundClock(clock: RoundClock, now = Date.now()): RoundClock {
  return clock.pausedAt === undefined ? { ...clock, pausedAt: now } : clock
}

export function resumeRoundClock(clock: RoundClock, now = Date.now()): RoundClock {
  if (clock.pausedAt === undefined) return clock
  const { pausedAt, ...running } = clock
  return { ...running, startedAt: clock.startedAt + (now - pausedAt) }
}

export function adjustRoundClock(clock: RoundClock, deltaMs: number): RoundClock {
  return { ...clock, adjustMs: (clock.adjustMs ?? 0) + deltaMs }
}

/** why: the end-of-round procedure has no pause control, so calling time on a paused clock resumes it or Pokémon overtime would stay frozen. */
export function callRoundTime(clock: RoundClock, now = Date.now()): RoundClock {
  if (clock.calledAtMs !== undefined) return clock
  const running = resumeRoundClock(clock, now)
  return { ...running, calledAtMs: elapsedMs(running, now) }
}

export function stepRoundTurn(
  clock: RoundClock,
  system: PlaySystemId | undefined,
  step: 1 | -1,
): RoundClock {
  const view = roundClockView(clock, system)
  if (view.kind !== "time") return clock
  return { ...clock, turn: Math.min(view.turns + 1, Math.max(0, view.turn + step)) }
}

export function addRoundBonusTurns(clock: RoundClock, turns: number): RoundClock {
  return { ...clock, bonusTurns: (clock.bonusTurns ?? 0) + turns }
}
