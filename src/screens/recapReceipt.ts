import { counterValueLabel, playSystemRules } from "@/features/game/playSystems"
import { formatConjunction, formatDate, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"

import type { GameSummaryModel, SummaryPlayer } from "./gameSummary"
import { playedFor, recapHeadline, recapOut, standings } from "./gameSummary"

export interface ReceiptSeat {
  player: SummaryPlayer
  won: boolean
  outTurn?: number
}

export interface Receipt {
  claim: string
  life?: number
  low?: { column: number; row: number }
  line?: string
  seats: ReceiptSeat[]
  meta: string
  caption: string
}

export function recapReceipt(model: GameSummaryModel): Receipt {
  const winners = model.players.filter(({ outcome }) => outcome === "win")
  const lead = winners.at(0)
  const life =
    lead && !model.logged && winners.every(({ life }) => life === lead.life) ? lead.life : undefined
  const names = formatConjunction(winners.map(({ name }) => name))
  const claim =
    life === undefined
      ? recapHeadline(model)
      : translate("play:summary.receipt.claim", {
          names,
          value: counterValueLabel(model.system, life),
        })
  const lives = model.recap?.lives
  const steps = model.recap?.steps
  const finishTurn = model.recap?.finishTurn
  const nameAt = (seat: number) => model.players[seat]?.name ?? ""
  const low = lead && lives ? lowestRow(lives, model.players.indexOf(lead)) : undefined
  const onTurn = (turn: number | undefined, event: string) =>
    turn === undefined ? event : translate("play:summary.receipt.onTurn", { turn, event })
  const step = low ? steps?.[low.row - 1] : undefined
  const hit =
    low && lives
      ? {
          name: nameAt(step?.seat ?? low.column),
          count: lives[low.row - 1][low.column] - lives[low.row][low.column],
        }
      : undefined
  const line =
    lead && lives && !model.logged
      ? joinParts([
          hit
            ? onTurn(
                step?.turn,
                step?.from === undefined
                  ? translate("play:summary.receipt.took", hit)
                  : translate("play:summary.receipt.hit", { ...hit, source: nameAt(step.from) }),
              )
            : undefined,
          onTurn(
            finishTurn,
            translate("play:summary.receipt.wins", { names, count: winners.length }),
          ),
        ])
      : undefined
  // why: in a race the loser is out when someone else reaches the goal, so their own last change is not when they went out.
  const survive = playSystemRules(model.system).counter.goal.kind === "survive"
  const seats = model.players.map((player, column): ReceiptSeat => {
    const out = recapOut(model, player)
    const moved =
      lives?.findLastIndex((row, index) => index > 0 && row[column] !== lives[index - 1][column]) ??
      -1
    const outTurn =
      (out?.cause === "commanderDamage" || (out?.cause === "life" && survive)) && moved > 0
        ? steps?.[moved - 1]?.turn
        : undefined
    return {
      player,
      won: player.outcome === "win",
      ...(outTurn === undefined ? {} : { outTurn }),
    }
  })
  const players = formatConjunction(standings(model).map(({ name }) => name))
  return {
    claim,
    ...(life === undefined ? {} : { life }),
    ...(low ? { low } : {}),
    ...(line ? { line } : {}),
    seats,
    meta: joinParts([
      model.format,
      model.finishedAt
        ? formatDate(model.finishedAt, { month: "short", day: "numeric" })
        : undefined,
      playedFor(model),
    ]),
    caption:
      finishTurn === undefined
        ? translate("play:summary.receipt.caption", { claim, players, format: model.format })
        : translate("play:summary.receipt.captionOnTurn", {
            claim,
            players,
            format: model.format,
            turn: finishTurn,
          }),
  }
}

function lowestRow(lives: readonly (readonly number[])[], column: number) {
  let row = 0
  lives.forEach((lifeRow, index) => {
    if (lifeRow[column] < lives[row][column]) row = index
  })
  return row > 0 ? { column, row } : undefined
}
