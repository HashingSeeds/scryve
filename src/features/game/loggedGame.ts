import { isoDate, parseIsoDate } from "@/features/matches/manualMatchForm"
import { translate } from "@/i18n/translate"

import { createLocalGame, validatePlayerNames } from "./domain"
import type { LocalGameAccountInput } from "./localPersistence"
import { defaultStartingLife, playSystemFormat, type PlaySystemId } from "./playSystems"
import type { LocalGame } from "./types"

const MAX_LOGGED_MINUTES = 24 * 60

export type LoggedGameDraft = {
  system?: PlaySystemId
  format?: string
  names: string[]
  winnerSeat?: number | "draw"
  date: string
  minutes: string
}

export function defaultLoggedGameDraft(
  setup: Pick<LoggedGameDraft, "system" | "format">,
  today = new Date(),
): LoggedGameDraft {
  return {
    system: setup.system,
    format: setup.system ? playSystemFormat(setup.system, setup.format) : undefined,
    names: ["", ""],
    date: isoDate(today),
    minutes: "",
  }
}

export function buildLoggedGame(
  draft: LoggedGameDraft,
  account: LocalGameAccountInput | undefined,
  now = Date.now(),
): { ok: true; game: LocalGame } | { ok: false; error: string } {
  const names = validatePlayerNames(draft.names)
  if (!names.valid) return { ok: false, error: names.errors.find(Boolean)! }
  if (
    draft.winnerSeat === undefined ||
    (draft.winnerSeat !== "draw" && !draft.names[draft.winnerSeat])
  )
    return { ok: false, error: translate("play:logGame.error.noWinner") }
  const day = parseIsoDate(draft.date)
  if (day === undefined) return { ok: false, error: translate("play:recordMatch.error.dateFormat") }
  const today = parseIsoDate(isoDate(new Date(now)))!
  if (day > today) return { ok: false, error: translate("play:recordMatch.error.dateFuture") }
  const minutes = draft.minutes.trim() === "" ? 0 : Number(draft.minutes)
  if (
    draft.minutes.trim() !== "" &&
    (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_LOGGED_MINUTES)
  )
    return {
      ok: false,
      error: translate("play:logGame.error.minutesRange", { min: 1, max: MAX_LOGGED_MINUTES }),
    }
  const finishedAt = day === today ? now : new Date(day).setHours(12)
  const created = createLocalGame({
    players: names.names.map((name) => ({ name, color: "" })),
    startingLife: defaultStartingLife(draft.system, draft.format, names.names.length),
    system: draft.system,
    format: draft.format,
    now: finishedAt - minutes * 60_000,
    account,
  })
  const winner = draft.winnerSeat === "draw" ? undefined : created.players[draft.winnerSeat]
  return {
    ok: true,
    game: {
      ...created,
      status: "finished",
      updatedAt: finishedAt,
      finishedAt,
      result: winner ? { kind: "win", winnerPlayerIds: [winner.id] } : { kind: "draw" },
      logged: true,
    },
  }
}
