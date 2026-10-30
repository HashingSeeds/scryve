import { ConvexError } from "convex/values"

import { winsNeeded } from "../matchResults"
import {
  MAX_EVENT_PLAYERS,
  MAX_EVENT_ROUNDS,
  MAX_POD_SIZE,
  MIN_POD_SIZE,
  type EventPlayerState,
  type EventSettings,
  type EventStructure,
  type EventTableState,
  type TableResult,
} from "./model"
import { pairSwissRound } from "./pairing"
import { pairPodRound } from "./pods"
import type { EventRules } from "./rules"

export const EVENT_STATUSES = ["registration", "active", "finished"] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const TABLE_STATUSES = ["open", "reported", "confirmed"] as const
export type TableStatus = (typeof TABLE_STATUSES)[number]

export type EventActor =
  { readonly kind: "organizer" } | { readonly kind: "player"; readonly playerId: string }

export interface EventClock {
  readonly startedAt: number
  readonly durationMs: number
  readonly pausedAt?: number
}

export interface EventTable extends EventTableState {
  readonly status: TableStatus
  readonly reportedBy?: string
}

export const EVENT_ERROR_CODES = [
  "name_rejected",
  "event_limit",
  "event_finished",
  "event_full",
  "results_missing",
  "not_enough_players",
  "result_confirmed",
  "nothing_to_confirm",
] as const
export type EventErrorCode = (typeof EVENT_ERROR_CODES)[number]

/** why: Convex hides plain Error messages in production, so failures players can hit by racing each other carry a code the app translates. */
export const eventError = (code: EventErrorCode, message: string) =>
  new ConvexError({ code, message })

export const MIN_ROUND_MINUTES = 5
export const MAX_ROUND_MINUTES = 180
const MAX_CLOCK_ADJUST_MINUTES = 60

export function assertRoundMinutes(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < MIN_ROUND_MINUTES || minutes > MAX_ROUND_MINUTES)
    throw new Error(`Rounds must be ${MIN_ROUND_MINUTES}–${MAX_ROUND_MINUTES} minutes`)
  return minutes
}

export function assertPlannedRounds(rounds: number) {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_EVENT_ROUNDS)
    throw new Error(`An event can have 1–${MAX_EVENT_ROUNDS} rounds`)
  return rounds
}

export function assertSettings(settings: EventSettings) {
  const { win, draw, loss } = settings.points
  for (const value of [win, draw, loss])
    if (!Number.isInteger(value) || value < 0 || value > 99)
      throw new Error("Points must be whole numbers from 0 to 99")
  if (win <= loss) throw new Error("A win must be worth more than a loss")
  if (settings.structure === "pods" && settings.bestOf !== 1)
    throw new Error("Pod events play one game per round")
  return settings
}

export function assertCanAddPlayer(status: EventStatus, playerCount: number) {
  if (status === "finished") throw eventError("event_finished", "This event has finished")
  if (playerCount >= MAX_EVENT_PLAYERS)
    throw eventError("event_full", `An event can have at most ${MAX_EVENT_PLAYERS} players`)
}

export const roundComplete = (tables: readonly { readonly result?: TableResult | null }[]) =>
  tables.every((table) => table.result != null)

export function standingsThroughRound(event: {
  status: EventStatus
  round: number
  tables: readonly { readonly result?: TableResult | null }[]
}) {
  if (event.round === 0 || event.status === "finished") return event.round
  return roundComplete(event.tables) ? event.round : event.round - 1
}

export type RoundBlocker =
  | { readonly kind: "finished" }
  | { readonly kind: "results" }
  | { readonly kind: "players"; readonly count: number }
  | { readonly kind: "maxRounds" }

export function startRoundBlocker(state: {
  status: EventStatus
  round: number
  structure: EventStructure
  players: readonly EventPlayerState[]
  tables: readonly { readonly result?: TableResult | null }[]
}): RoundBlocker | undefined {
  if (state.status === "finished") return { kind: "finished" }
  if (!roundComplete(state.tables)) return { kind: "results" }
  const minimum = state.structure === "pods" ? MIN_POD_SIZE : 2
  if (state.players.filter((player) => !player.dropped).length < minimum)
    return { kind: "players", count: minimum }
  if (state.round >= MAX_EVENT_ROUNDS) return { kind: "maxRounds" }
  return undefined
}

function roundBlockerError(blocker: RoundBlocker) {
  switch (blocker.kind) {
    case "finished":
      return eventError("event_finished", "This event has finished")
    case "results":
      return eventError("results_missing", "Enter every result before the next round")
    case "players":
      return eventError(
        "not_enough_players",
        `At least ${blocker.count} players are needed to start a round`,
      )
    case "maxRounds":
      return new Error(`An event can have at most ${MAX_EVENT_ROUNDS} rounds`)
  }
}

export function startRound(state: {
  status: EventStatus
  round: number
  players: readonly EventPlayerState[]
  tables: readonly EventTable[]
  settings: EventSettings
  random: () => number
}): { round: number; tables: EventTable[] } {
  const blocker = startRoundBlocker({
    ...state,
    structure: state.settings.structure,
    tables: state.tables.filter((table) => table.round === state.round),
  })
  if (blocker) throw roundBlockerError(blocker)
  const pair = state.settings.structure === "pods" ? pairPodRound : pairSwissRound
  const pairings = pair({
    players: state.players,
    tables: state.tables,
    settings: state.settings,
    random: state.random,
  })
  const round = state.round + 1
  return {
    round,
    tables: pairings.map((playerIds, index) =>
      playerIds.length === 1
        ? { round, table: index + 1, playerIds, result: { kind: "bye" }, status: "confirmed" }
        : { round, table: index + 1, playerIds, status: "open" },
    ),
  }
}

export function assertResult(
  table: Pick<EventTableState, "playerIds">,
  result: TableResult,
  settings: EventSettings,
  rules: EventRules,
) {
  const seats = table.playerIds.length
  switch (result.kind) {
    case "bye":
      throw new Error("Byes are assigned when a round is paired")
    case "doubleLoss":
      if (!rules.doubleLoss || seats !== 2)
        throw new Error("A double loss isn't a result in this game")
      return result
    case "pod":
      if (settings.structure !== "pods" || seats < MIN_POD_SIZE || seats > MAX_POD_SIZE)
        throw new Error("Only pods record a pod result")
      if (result.winnerSeat === null) {
        if (!rules.draws) throw new Error("Draws aren't a result in this game")
      } else if (
        !Number.isInteger(result.winnerSeat) ||
        result.winnerSeat < 0 ||
        result.winnerSeat >= seats
      )
        throw new Error("Choose a winner from this pod")
      return result
    case "match": {
      if (settings.structure !== "swiss" || seats !== 2)
        throw new Error("Only 1v1 tables record a match result")
      const needed = winsNeeded(settings.bestOf)
      const { gamesWon, gamesDrawn } = result
      if (
        gamesWon.length !== 2 ||
        gamesWon.some((won) => !Number.isInteger(won) || won < 0 || won > needed)
      )
        throw new Error(`Each player wins 0–${needed} games in a best of ${settings.bestOf}`)
      if (gamesWon[0] === needed && gamesWon[1] === needed)
        throw new Error("Only one player can win the match")
      if (!Number.isInteger(gamesDrawn) || gamesDrawn < 0 || gamesDrawn > settings.bestOf)
        throw new Error("Enter a valid number of drawn games")
      if (!rules.draws && gamesWon[0] === gamesWon[1])
        throw new Error("Draws aren't a result in this game")
      return result
    }
  }
}

const REFUSALS = {
  notStarted: { message: "This event hasn't started" },
  finished: { code: "event_finished", message: "This event has finished" },
  notRunning: { message: "This event isn't running a round" },
  bye: { message: "A bye's result can't change" },
  notYourReport: { message: "You can only report your own table" },
  earlierRound: { message: "Only the organizer can change an earlier round" },
  confirmed: {
    code: "result_confirmed",
    message: "Ask the organizer to change a confirmed result",
  },
  nothingToConfirm: { code: "nothing_to_confirm", message: "There's no result to confirm" },
  notYourConfirm: { message: "You can only confirm your own table" },
  ownReport: { message: "Another player at your table confirms your report" },
} as const satisfies Record<string, { code?: EventErrorCode; message: string }>

export type EventRefusal = keyof typeof REFUSALS

function refusalError(refusal: EventRefusal) {
  const { code, message }: { code?: EventErrorCode; message: string } = REFUSALS[refusal]
  return code ? eventError(code, message) : new Error(message)
}

type ResultState = {
  status: EventStatus
  round: number
  table: Pick<EventTable, "round" | "playerIds" | "status"> & {
    readonly result?: TableResult | null
    readonly reportedBy?: string | null
  }
}

const seated = (table: ResultState["table"], playerId: string) => table.playerIds.includes(playerId)

export function reportRefusal(state: ResultState, actor: EventActor): EventRefusal | undefined {
  const { table } = state
  if (state.status === "registration") return "notStarted"
  if (table.result?.kind === "bye") return "bye"
  if (state.status !== "active") return "finished"
  if (actor.kind === "organizer") return undefined
  if (!seated(table, actor.playerId)) return "notYourReport"
  if (table.round !== state.round) return "earlierRound"
  if (table.status === "confirmed") return "confirmed"
  return undefined
}

export function confirmRefusal(state: ResultState, actor: EventActor): EventRefusal | undefined {
  const { table } = state
  if (state.status !== "active") return "notRunning"
  if (table.status !== "reported" || !table.result) return "nothingToConfirm"
  if (actor.kind === "organizer") return undefined
  if (!seated(table, actor.playerId)) return "notYourConfirm"
  if (table.reportedBy === actor.playerId) return "ownReport"
  return undefined
}

type TablePatch = Pick<EventTable, "result" | "status" | "reportedBy">

export function reportResult(
  state: { status: EventStatus; round: number; table: EventTable },
  actor: EventActor,
  result: TableResult | null,
): TablePatch {
  const refusal = reportRefusal(state, actor)
  if (refusal) throw refusalError(refusal)
  if (actor.kind === "organizer")
    return result === null
      ? { result: undefined, status: "open", reportedBy: undefined }
      : { result, status: "confirmed", reportedBy: undefined }
  if (result === null) throw new Error("Only the organizer can clear a result")
  return { result, status: "reported", reportedBy: actor.playerId }
}

export function confirmResult(
  state: { status: EventStatus; round: number; table: EventTable },
  actor: EventActor,
): TablePatch {
  const refusal = confirmRefusal(state, actor)
  if (refusal) throw refusalError(refusal)
  const { table } = state
  return { result: table.result, status: "confirmed", reportedBy: table.reportedBy }
}

export type ClockAction =
  | { readonly kind: "pause" }
  | { readonly kind: "resume" }
  | { readonly kind: "adjust"; readonly minutes: number }

export function changeClock(clock: EventClock, action: ClockAction, now: number): EventClock {
  switch (action.kind) {
    case "pause":
      return clock.pausedAt === undefined ? { ...clock, pausedAt: now } : clock
    case "resume":
      return clock.pausedAt === undefined
        ? clock
        : { startedAt: clock.startedAt + (now - clock.pausedAt), durationMs: clock.durationMs }
    case "adjust": {
      const { minutes } = action
      if (
        !Number.isInteger(minutes) ||
        minutes === 0 ||
        Math.abs(minutes) > MAX_CLOCK_ADJUST_MINUTES
      )
        throw new Error(`Adjust the clock by 1–${MAX_CLOCK_ADJUST_MINUTES} minutes`)
      return { ...clock, durationMs: Math.max(0, clock.durationMs + minutes * 60_000) }
    }
  }
}

export const clockRemainingMs = (clock: EventClock, now: number) =>
  clock.durationMs - ((clock.pausedAt ?? now) - clock.startedAt)
