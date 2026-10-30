import { PLAYER_COLORS, wellFormedPlayerName } from "@/features/game/domain"
import { defaultStartingLife, isPlaySystemId, playFormatLabel } from "@/features/game/playSystems"
import type { LocalSetup } from "@/features/game/recentSetups"
import { ROUND_CLOCK_MINUTES, type RoundClockSetup } from "@/features/game/roundClock"
import { translate } from "@/i18n/translate"
import { convexErrorCode } from "@/utils/convexError"

import type { EventTableView, EventView } from "./eventSource"
import {
  assertResult,
  clockRemainingMs,
  confirmRefusal,
  reportRefusal,
  type EventActor,
  type EventClock,
  type EventErrorCode,
} from "../../../convex/lib/events/commands"
import type { TableResult } from "../../../convex/lib/events/model"
import { eventRules, type Tiebreaker } from "../../../convex/lib/events/rules"

type EventSummary = Pick<EventView, "system" | "format" | "structure" | "status" | "round"> & {
  bestOf?: EventView["bestOf"]
}

export function eventMeta(event: EventSummary) {
  return [
    playFormatLabel(event.system, event.format),
    translate(`events:structure.${event.structure}`),
    ...(event.structure === "swiss" && event.bestOf && event.bestOf > 1
      ? [translate("events:bestOf", { bestOf: event.bestOf })]
      : []),
  ].join(" · ")
}

export const eventStatusText = (event: EventSummary) =>
  translate(`events:status.${event.status}`, { round: event.round })

export function myTable(view: EventView) {
  const me = view.myPlayerId
  return me ? view.tables.find((table) => table.playerIds.includes(me)) : undefined
}

export function playerName(view: EventView, playerId: string) {
  return view.players.find((player) => player.id === playerId)?.name ?? "?"
}

const actorOf = (view: EventView): EventActor | undefined =>
  view.isOrganizer
    ? { kind: "organizer" }
    : view.myPlayerId
      ? { kind: "player", playerId: view.myPlayerId }
      : undefined

function canChange(refusal: typeof reportRefusal, view: EventView, table: EventTableView) {
  const actor = actorOf(view)
  return (
    actor !== undefined &&
    refusal(
      { status: view.status, round: view.round, table: { ...table, round: view.round } },
      actor,
    ) === undefined
  )
}

export const canReport = (view: EventView, table: EventTableView) =>
  canChange(reportRefusal, view, table)

export const canConfirm = (view: EventView, table: EventTableView) =>
  canChange(confirmRefusal, view, table)

export function resultIsValid(view: EventView, table: EventTableView, result: TableResult) {
  if (!isPlaySystemId(view.system)) return false
  try {
    assertResult(table, result, view, eventRules(view.system))
    return true
  } catch {
    return false
  }
}

export function resultText(view: EventView, table: EventTableView) {
  const { result } = table
  if (!result) return translate(`events:tableStatus.${table.status}`)
  switch (result.kind) {
    case "bye":
      return translate("events:bye")
    case "doubleLoss":
      return translate("events:result.doubleLoss")
    case "pod":
      return result.winnerSeat === null
        ? translate("events:result.draw")
        : translate("events:result.winner", {
            name: playerName(view, table.playerIds[result.winnerSeat] ?? ""),
          })
    case "match":
      return [...result.gamesWon, ...(result.gamesDrawn > 0 ? [result.gamesDrawn] : [])].join("-")
  }
}

export function myResultText(view: EventView, table: EventTableView) {
  const { result } = table
  const seat = view.myPlayerId ? table.playerIds.indexOf(view.myPlayerId) : -1
  if (result?.kind !== "match" || seat < 0) return resultText(view, table)
  const mine = result.gamesWon[seat] ?? 0
  const theirs = Math.max(0, ...result.gamesWon.filter((_, index) => index !== seat))
  const score = [mine, theirs, ...(result.gamesDrawn > 0 ? [result.gamesDrawn] : [])].join("-")
  const outcome = mine > theirs ? "won" : mine < theirs ? "lost" : "drew"
  return translate(`events:result.${outcome}`, { score })
}

export function confirmingOpponents(view: EventView, table: EventTableView) {
  return table.playerIds.filter(
    (id) =>
      id !== view.myPlayerId && view.players.some((player) => player.id === id && !player.guest),
  ).length
}

export const isFinalRound = (view: Pick<EventView, "status" | "round" | "plannedRounds">) =>
  view.status === "active" && view.round >= view.plannedRounds

export function tablePlayers(view: EventView, table: EventTableView) {
  const names = table.playerIds.map((id) => playerName(view, id))
  return names.length === 2
    ? translate("events:versus", { first: names[0], second: names[1] })
    : names.join(", ")
}

export function remainingMs(clock: EventClock, now: number) {
  return Math.max(0, clockRemainingMs(clock, now))
}

/** why: a local countdown starts from the minutes left on the event clock, rounded up so it never ends before the round does. */
export function localClockFor(clock: EventClock | null, now: number): RoundClockSetup | undefined {
  const left = clock ? remainingMs(clock, now) : 0
  if (left === 0) return undefined
  return {
    mode: "countdown",
    minutes: Math.min(ROUND_CLOCK_MINUTES.max, Math.max(1, Math.ceil(left / 60_000))),
  }
}

function distinctNames(names: readonly string[]) {
  const seen = new Set<string>()
  return names.map((raw, seat) => {
    const name = wellFormedPlayerName(raw) || `${seat + 1}`
    const key = name.toLocaleLowerCase()
    const unique = seen.has(key) ? `${name.slice(0, 21)} ${seat + 1}` : name
    seen.add(unique.toLocaleLowerCase())
    return unique
  })
}

export function matchSetupFor(view: EventView, table: EventTableView, now: number): LocalSetup {
  const system = isPlaySystemId(view.system) ? view.system : undefined
  const names = distinctNames(table.playerIds.map((id) => playerName(view, id)))
  const clock = localClockFor(view.clock, now)
  return {
    players: names.map((name, seat) => ({ name, color: PLAYER_COLORS[seat] })),
    startingLife: defaultStartingLife(system, view.format, names.length),
    ...(system ? { system, format: view.format } : {}),
    match: { bestOf: view.bestOf },
    ...(clock ? { clock } : {}),
  }
}

export const firstTiebreaker = (system: string): Tiebreaker | undefined =>
  isPlaySystemId(system) ? eventRules(system).tiebreakers[0] : undefined

export const percent = (value: number) => `${(value * 100).toFixed(1)}%`

const ERROR_TEXT: Record<EventErrorCode | "rate_limited", () => string> = {
  name_rejected: () => translate("events:errors.nameRejected"),
  event_limit: () => translate("events:errors.eventLimit"),
  event_finished: () => translate("events:errors.eventFinished"),
  event_full: () => translate("events:errors.eventFull"),
  results_missing: () => translate("events:errors.resultsMissing"),
  not_enough_players: () => translate("events:errors.notEnoughPlayers"),
  result_confirmed: () => translate("events:errors.resultConfirmed"),
  nothing_to_confirm: () => translate("events:errors.nothingToConfirm"),
  rate_limited: () => translate("events:errors.rateLimited"),
}

const hasErrorText = (code: string): code is keyof typeof ERROR_TEXT =>
  Object.hasOwn(ERROR_TEXT, code)

export function eventErrorText(cause: unknown) {
  const code = convexErrorCode(cause)
  return code && hasErrorText(code) ? ERROR_TEXT[code]() : translate("events:failed")
}
