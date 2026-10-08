import type { FunctionArgs } from "convex/server"

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
  // why: free text so the score stays optional; blank means unknown, not zero.
  score: { wins: string; losses: string; draws: string }
  eventName: string
  round: string
  date: string
}

export type RecordManualMatchArgs = FunctionArgs<typeof api.matches.recordManualMatch>

export const MAX_OPPONENTS = MAX_PLAYERS - 1
export const BEST_OF_OPTIONS: readonly BestOf[] = [1, 3, 5]
export const OUTCOME_OPTIONS: readonly { id: SeatOutcome; label: string }[] = [
  { id: "win", label: "Win" },
  { id: "loss", label: "Loss" },
  { id: "draw", label: "Draw" },
]

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

// why: a match has one winner, so picking a new one demotes the previous winner to a loss.
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

// why: a two-player form never shows the opponent's result, so a pod starts from the derived one.
export function withOpponentAdded(draft: ManualMatchDraft): ManualMatchDraft {
  const opponents =
    draft.opponents.length === 1
      ? [{ ...draft.opponents[0], outcome: OPPOSITE[draft.outcome] }]
      : draft.opponents
  return { ...draft, opponents: [...opponents, emptyOpponent()] }
}

function parseCount(
  value: string,
  label: string,
  max: number,
): { ok: true; value: number } | { ok: false; error: string } {
  if (value.trim() === "") return { ok: true, value: 0 }
  const count = Number(value)
  if (!Number.isInteger(count) || count < 0 || count > max)
    return { ok: false, error: `${label} must be 0–${max}` }
  return { ok: true, value: count }
}

export type ManualMatchBuild =
  { ok: true; args: RecordManualMatchArgs } | { ok: false; error: string }

export function buildManualMatchArgs(
  draft: ManualMatchDraft,
  ids: { publicId: string; deckVersionId?: Id<"deckVersions"> },
  now = Date.now(),
): ManualMatchBuild {
  const twoPlayer = draft.opponents.length === 1
  const opponents: RecordManualMatchArgs["opponents"] = []
  for (const [index, opponent] of draft.opponents.entries()) {
    const name = opponent.name.trim()
    if (!name) return { ok: false, error: `Opponent ${index + 1} needs a name` }
    if (name.length > MAX_DISPLAY_NAME_LENGTH)
      return { ok: false, error: `Names must be at most ${MAX_DISPLAY_NAME_LENGTH} characters` }
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
    return { ok: false, error: "Pick a winner, or mark the drawn seats" }
  const finishedAt = parseIsoDate(draft.date)
  if (finishedAt === undefined) return { ok: false, error: "Date must be YYYY-MM-DD" }
  if (finishedAt > now + 24 * 60 * 60 * 1000)
    return { ok: false, error: "Date cannot be in the future" }
  const eventName = draft.eventName.trim()
  if (eventName.length > MAX_EVENT_NAME_LENGTH)
    return { ok: false, error: `Event name must be at most ${MAX_EVENT_NAME_LENGTH} characters` }
  const roundNumber = draft.round.trim() === "" ? undefined : Number(draft.round)
  if (
    roundNumber !== undefined &&
    (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > MAX_ROUND_NUMBER)
  )
    return { ok: false, error: `Round must be 1–${MAX_ROUND_NUMBER}` }

  let me: RecordManualMatchArgs["me"] = {
    seat: 1,
    ...(ids.deckVersionId ? { deckVersionId: ids.deckVersionId } : {}),
    outcome: draft.outcome,
  }
  const scoreGiven = twoPlayer && Object.values(draft.score).some((value) => value.trim() !== "")
  if (scoreGiven) {
    // why: a score is all or nothing; only draws may be left blank to mean none.
    if (draft.score.wins.trim() === "" || draft.score.losses.trim() === "")
      return { ok: false, error: "Enter both wins and losses, or leave the score blank" }
    const maxWins = Math.ceil(draft.bestOf / 2)
    const wins = parseCount(draft.score.wins, "Wins", maxWins)
    if (!wins.ok) return wins
    const losses = parseCount(draft.score.losses, "Losses", maxWins)
    if (!losses.ok) return losses
    const draws = parseCount(draft.score.draws, "Draws", draft.bestOf)
    if (!draws.ok) return draws
    if (wins.value + losses.value > draft.bestOf)
      return { ok: false, error: `A best of ${draft.bestOf} has at most ${draft.bestOf} games` }
    const expected: SeatOutcome =
      wins.value > losses.value ? "win" : losses.value > wins.value ? "loss" : "draw"
    if (expected !== draft.outcome)
      return { ok: false, error: `A ${wins.value}-${losses.value} score is a ${expected}` }
    me = { ...me, gamesWon: wins.value, gamesDrawn: draws.value }
    opponents[0] = { ...opponents[0], gamesWon: losses.value, gamesDrawn: draws.value }
  }
  return {
    ok: true,
    args: {
      publicId: ids.publicId,
      bestOf: draft.bestOf,
      finishedAt,
      ...(eventName ? { eventName } : {}),
      ...(roundNumber === undefined ? {} : { roundNumber }),
      me,
      opponents,
    },
  }
}
