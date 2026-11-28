import { counterValueLabel, playSystemRules } from "@/features/game/playSystems"
import type { ReceiptChange, ReceiptLog } from "@/features/game/receiptLog"
import { formatConjunction, formatDate, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"

import type { GameSummaryModel, SummaryPlayer } from "./gameSummary"
import { playedFor, recapHeadline, recapOut, standings } from "./gameSummary"

// why: connected games and local games with trimmed events keep only the recap's life rows, which record no source or turn.
function rowsReceiptLog(model: GameSummaryModel): ReceiptLog | undefined {
  const lives = model.recap?.lives
  if (!lives) return undefined
  return {
    changes: lives.slice(1).flatMap((row, index) =>
      row.flatMap((life, seat) => {
        const delta = life - lives[index][seat]
        return delta === 0 ? [] : [{ playerId: model.players[seat].id, delta }]
      }),
    ),
  }
}

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
  const log = model.logged ? undefined : (model.log ?? rowsReceiptLog(model))
  const byId = new Map(model.players.map((player) => [player.id, player]))
  const moves = (player: SummaryPlayer, change: ReceiptChange) =>
    change.playerId === player.id ||
    (player.team !== undefined && byId.get(change.playerId)?.team === player.team)
  const hit = lead && log ? lowestHit(log.changes, (change) => moves(lead, change)) : undefined
  const onTurn = (turn: number | undefined, event: string) =>
    turn === undefined ? event : translate("play:summary.receipt.onTurn", { turn, event })
  const line = joinParts([
    hit
      ? onTurn(
          hit.turn,
          hit.from
            ? translate("play:summary.receipt.hit", {
                source: byId.get(hit.from)?.name ?? "",
                name: byId.get(hit.playerId)?.name ?? "",
                count: -hit.delta,
              })
            : translate("play:summary.receipt.took", {
                name: byId.get(hit.playerId)?.name ?? "",
                count: -hit.delta,
              }),
        )
      : undefined,
    lead && log
      ? onTurn(
          log.finishTurn,
          translate("play:summary.receipt.wins", { names, count: winners.length }),
        )
      : undefined,
  ])
  // why: in a race the loser is out when someone else reaches the goal, so their own last change is not when they went out.
  const survive = playSystemRules(model.system).counter.goal.kind === "survive"
  const seats = model.players.map((player): ReceiptSeat => {
    const out = recapOut(model, player)
    const outTurn =
      out?.cause === "commanderDamage" || (out?.cause === "life" && survive)
        ? log?.changes.findLast((change) => moves(player, change))?.turn
        : undefined
    return {
      player,
      won: player.outcome === "win",
      ...(outTurn === undefined ? {} : { outTurn }),
    }
  })
  const players = formatConjunction(standings(model).map(({ name }) => name))
  const low =
    lead && model.recap?.lives
      ? lowestRow(model.recap.lives, model.players.indexOf(lead))
      : undefined
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
      log?.finishTurn === undefined
        ? translate("play:summary.receipt.caption", { claim, players, format: model.format })
        : translate("play:summary.receipt.captionOnTurn", {
            claim,
            players,
            format: model.format,
            turn: log.finishTurn,
          }),
  }
}

function lowestHit(
  changes: readonly ReceiptChange[],
  movesLead: (change: ReceiptChange) => boolean,
) {
  let life = 0
  let low = 0
  let run: ReceiptChange | undefined
  let hit: ReceiptChange | undefined
  for (const change of changes) {
    run =
      run &&
      run.playerId === change.playerId &&
      run.from === change.from &&
      run.turn === change.turn &&
      Math.sign(run.delta) === Math.sign(change.delta)
        ? { ...run, delta: run.delta + change.delta }
        : change
    if (!movesLead(change)) continue
    life += change.delta
    if (life < low) {
      low = life
      hit = run
    }
  }
  return hit
}

function lowestRow(lives: readonly (readonly number[])[], column: number) {
  let row = 0
  lives.forEach((lifeRow, index) => {
    if (lifeRow[column] < lives[row][column]) row = index
  })
  return row > 0 ? { column, row } : undefined
}
