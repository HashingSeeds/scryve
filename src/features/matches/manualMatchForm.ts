import type { FunctionArgs } from "convex/server"

import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"

import type { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EVENT_NAME_LENGTH,
  MAX_PLAYERS,
  MAX_ROUND_NUMBER,
} from "../../../convex/lib/policy"

export type BestOf = 1 | 3 | 5
export type SeatOutcome = "win" | "loss" | "draw"

export type OpponentDraft = { name: string; deckName: string; outcome: SeatOutcome }

export type ManualMatchDraft = {
  bestOf: BestOf
  outcome: SeatOutcome
  opponents: OpponentDraft[]
  score: { wins: string; losses: string; draws: string }
  eventName: string
  round: string
  date: string
}

export type RecordManualMatchArgs = FunctionArgs<typeof api.matches.recordManualMatch>

export const MAX_OPPONENTS = MAX_PLAYERS - 1
export const BEST_OF_OPTIONS: readonly BestOf[] = [1, 3, 5]
export const OUTCOME_OPTIONS = [
  { id: "win", labelTx: "play:history.outcome.win" },
  { id: "loss", labelTx: "play:history.outcome.loss" },
  { id: "draw", labelTx: "play:history.outcome.draw" },
] as const satisfies readonly { id: SeatOutcome; labelTx: TxKeyPath }[]

export function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return undefined
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(year, month - 1, day)
  const valid =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  return valid ? date.getTime() : undefined
}

export function emptyOpponent(): OpponentDraft {
  return { name: "", deckName: "", outcome: "loss" }
}

export function defaultManualMatchDraft(today = new Date()): ManualMatchDraft {
  return {
    bestOf: 3,
    outcome: "win",
    opponents: [emptyOpponent()],
    score: { wins: "", losses: "", draws: "" },
    eventName: "",
    round: "",
    date: isoDate(today),
  }
}

export function withSeatOutcome(
  draft: ManualMatchDraft,
  seat: "me" | number,
  outcome: SeatOutcome,
): ManualMatchDraft {
  const demote = (current: SeatOutcome) =>
    outcome === "win" && current === "win" ? "loss" : current
  return {
    ...draft,
    outcome: seat === "me" ? outcome : demote(draft.outcome),
    opponents: draft.opponents.map((opponent, index) =>
      index === seat
        ? { ...opponent, outcome }
        : { ...opponent, outcome: demote(opponent.outcome) },
    ),
  }
}

const OPPOSITE: Record<SeatOutcome, SeatOutcome> = { win: "loss", loss: "win", draw: "draw" }

export function withOpponentAdded(draft: ManualMatchDraft): ManualMatchDraft {
  const opponents =
    draft.opponents.length === 1
      ? [{ ...draft.opponents[0], outcome: OPPOSITE[draft.outcome] }]
      : draft.opponents
  return { ...draft, opponents: [...opponents, emptyOpponent()] }
}

const COUNT_RANGE_TX = {
  wins: "play:recordMatch.error.winsRange",
  losses: "play:recordMatch.error.lossesRange",
  draws: "play:recordMatch.error.drawsRange",
} as const satisfies Record<keyof ManualMatchDraft["score"], TxKeyPath>

const SCORE_OUTCOME_TX = {
  win: "play:recordMatch.error.scoreIsWin",
  loss: "play:recordMatch.error.scoreIsLoss",
  draw: "play:recordMatch.error.scoreIsDraw",
} as const satisfies Record<SeatOutcome, TxKeyPath>

function parseCount(
  value: string,
  field: keyof ManualMatchDraft["score"],
  max: number,
): { ok: true; value: number } | { ok: false; error: string } {
  if (value.trim() === "") return { ok: true, value: 0 }
  const count = Number(value)
  if (!Number.isInteger(count) || count < 0 || count > max)
    return { ok: false, error: translate(COUNT_RANGE_TX[field], { max }) }
  return { ok: true, value: count }
}

export type ManualMatchBuild =
  { ok: true; args: RecordManualMatchArgs } | { ok: false; error: string }

export function buildManualMatchArgs(
  draft: ManualMatchDraft,
  ids: {
    publicId: string
    deckVersionId?: Id<"deckVersions">
    deckKey?: string
    deckFingerprint?: string
    deckName?: string
    system?: string
    format?: string
  },
  now = Date.now(),
): ManualMatchBuild {
  const twoPlayer = draft.opponents.length === 1
  const opponents: RecordManualMatchArgs["opponents"] = []
  for (const [index, opponent] of draft.opponents.entries()) {
    const name = opponent.name.trim()
    if (!name)
      return {
        ok: false,
        error: translate("play:recordMatch.error.opponentName", { number: index + 1 }),
      }
    if (name.length > MAX_DISPLAY_NAME_LENGTH)
      return {
        ok: false,
        error: translate("play:recordMatch.error.nameLength", { max: MAX_DISPLAY_NAME_LENGTH }),
      }
    const deckName = opponent.deckName.trim()
    opponents.push({
      seat: index + 2,
      displayName: name,
      ...(deckName ? { deckName } : {}),
      outcome: twoPlayer ? OPPOSITE[draft.outcome] : opponent.outcome,
    })
  }
  const outcomes = [draft.outcome, ...opponents.map((seat) => seat.outcome)]
  if (!outcomes.includes("win") && !outcomes.includes("draw"))
    return { ok: false, error: translate("play:recordMatch.error.noWinner") }
  const finishedAt = parseIsoDate(draft.date)
  if (finishedAt === undefined)
    return { ok: false, error: translate("play:recordMatch.error.dateFormat") }
  if (finishedAt > now + 24 * 60 * 60 * 1000)
    return { ok: false, error: translate("play:recordMatch.error.dateFuture") }
  const eventName = draft.eventName.trim()
  if (eventName.length > MAX_EVENT_NAME_LENGTH)
    return {
      ok: false,
      error: translate("play:recordMatch.error.eventLength", { max: MAX_EVENT_NAME_LENGTH }),
    }
  const roundNumber = draft.round.trim() === "" ? undefined : Number(draft.round)
  if (
    roundNumber !== undefined &&
    (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > MAX_ROUND_NUMBER)
  )
    return {
      ok: false,
      error: translate("play:recordMatch.error.roundRange", { max: MAX_ROUND_NUMBER }),
    }

  let me: RecordManualMatchArgs["me"] = {
    seat: 1,
    ...(ids.deckVersionId ? { deckVersionId: ids.deckVersionId } : {}),
    ...(ids.deckKey ? { deckKey: ids.deckKey } : {}),
    ...(ids.deckFingerprint ? { deckFingerprint: ids.deckFingerprint } : {}),
    ...(ids.deckName ? { deckName: ids.deckName } : {}),
    outcome: draft.outcome,
  }
  const scoreGiven = twoPlayer && Object.values(draft.score).some((value) => value.trim() !== "")
  if (scoreGiven) {
    if (draft.score.wins.trim() === "" || draft.score.losses.trim() === "")
      return { ok: false, error: translate("play:recordMatch.error.scoreIncomplete") }
    const maxWins = Math.ceil(draft.bestOf / 2)
    const wins = parseCount(draft.score.wins, "wins", maxWins)
    if (!wins.ok) return wins
    const losses = parseCount(draft.score.losses, "losses", maxWins)
    if (!losses.ok) return losses
    const draws = parseCount(draft.score.draws, "draws", draft.bestOf)
    if (!draws.ok) return draws
    if (wins.value + losses.value > draft.bestOf)
      return {
        ok: false,
        error: translate("play:recordMatch.error.tooManyGames", { bestOf: draft.bestOf }),
      }
    const expected: SeatOutcome =
      wins.value > losses.value ? "win" : losses.value > wins.value ? "loss" : "draw"
    if (expected !== draft.outcome)
      return {
        ok: false,
        error: translate(SCORE_OUTCOME_TX[expected], { wins: wins.value, losses: losses.value }),
      }
    me = { ...me, gamesWon: wins.value, gamesDrawn: draws.value }
    opponents[0] = { ...opponents[0], gamesWon: losses.value, gamesDrawn: draws.value }
  }
  return {
    ok: true,
    args: {
      publicId: ids.publicId,
      ...(ids.system ? { system: ids.system } : {}),
      ...(ids.format ? { format: ids.format } : {}),
      bestOf: draft.bestOf,
      finishedAt,
      ...(eventName ? { eventName } : {}),
      ...(roundNumber === undefined ? {} : { roundNumber }),
      me,
      opponents,
    },
  }
}
