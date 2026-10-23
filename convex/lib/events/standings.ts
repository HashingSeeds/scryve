import { winsNeeded } from "../matchResults"
import type {
  EventPlayerState,
  EventPoints,
  EventSettings,
  EventTableState,
  PlayerStanding,
  TableOutcome,
  TableResult,
} from "./model"
import type { EventRules, Tiebreaker } from "./rules"

export interface SeatOutcome {
  readonly playerId: string
  readonly outcome: TableOutcome
  readonly points: number
}

export function tableOutcomes(table: EventTableState, points: EventPoints): readonly SeatOutcome[] {
  const { result } = table
  if (!result) return []
  return table.playerIds.map((playerId, seat) => {
    const outcome = seatOutcome(result, seat)
    return { playerId, outcome, points: points[outcome] }
  })
}

function seatOutcome(result: TableResult, seat: number): TableOutcome {
  switch (result.kind) {
    case "bye":
      return "win"
    case "doubleLoss":
      return "loss"
    case "pod":
      if (result.winnerSeat === null) return "draw"
      return result.winnerSeat === seat ? "win" : "loss"
    case "match": {
      const most = Math.max(...result.gamesWon)
      if (result.gamesWon.filter((won) => won === most).length > 1) return "draw"
      return result.gamesWon[seat] === most ? "win" : "loss"
    }
  }
}

const GAME_POINTS = { win: 3, draw: 1, loss: 0 } as const
const EPSILON = 1e-9

interface PlayerRecord {
  points: number
  wins: number
  losses: number
  draws: number
  rounds: number
  byes: number
  gamePoints: number
  games: number
  opponents: string[]
  lostRoundSquares: number
}

export function computeStandings({
  players,
  tables,
  settings,
  rules,
}: {
  readonly players: readonly EventPlayerState[]
  readonly tables: readonly EventTableState[]
  readonly settings: EventSettings
  readonly rules: EventRules
}): readonly PlayerStanding[] {
  const records = new Map<string, PlayerRecord>()
  const recordOf = (id: string) => {
    let record = records.get(id)
    if (!record) {
      record = {
        points: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        rounds: 0,
        byes: 0,
        gamePoints: 0,
        games: 0,
        opponents: [],
        lostRoundSquares: 0,
      }
      records.set(id, record)
    }
    return record
  }
  const oneGamePerTable = settings.structure === "pods" || settings.bestOf === 1

  for (const table of tables) {
    const { result } = table
    if (!result) continue
    const seats = tableOutcomes(table, settings.points)
    for (const [seat, { playerId, outcome, points }] of seats.entries()) {
      const record = recordOf(playerId)
      record.points += points
      record.rounds += 1
      if (outcome === "win") record.wins += 1
      else if (outcome === "draw") record.draws += 1
      else {
        record.losses += 1
        record.lostRoundSquares += table.round ** 2
      }
      if (result.kind === "bye") {
        record.byes += 1
        const won = oneGamePerTable ? 1 : winsNeeded(settings.bestOf)
        record.games += won
        record.gamePoints += GAME_POINTS.win * won
        continue
      }
      for (const opponent of table.playerIds)
        if (opponent !== playerId) record.opponents.push(opponent)
      if (oneGamePerTable || result.kind !== "match") {
        record.games += 1
        record.gamePoints += GAME_POINTS[outcome]
      } else {
        const won = result.gamesWon[seat] ?? 0
        record.games += result.gamesWon.reduce((sum, games) => sum + games, 0) + result.gamesDrawn
        record.gamePoints += GAME_POINTS.win * won + GAME_POINTS.draw * result.gamesDrawn
      }
    }
  }

  const dropped = new Set(players.filter((player) => player.dropped).map((player) => player.id))
  const floored = (value: number) => Math.min(1, Math.max(rules.winPercentFloor, value))
  const matchWin = (id: string) => {
    const record = recordOf(id)
    if (rules.winPercent === "winsWithoutByes") {
      const rounds = record.rounds - record.byes
      return floored(rounds === 0 ? 0 : (record.wins - record.byes) / rounds)
    }
    const most = settings.points.win * record.rounds
    return floored(most === 0 ? 0 : record.points / most)
  }
  const asOpponent = (id: string) => {
    const percent = matchWin(id)
    const cap = rules.droppedWinPercentCap
    return cap !== undefined && dropped.has(id) ? Math.min(cap, percent) : percent
  }
  const gameWin = (id: string) => {
    const { gamePoints, games } = recordOf(id)
    return floored(games === 0 ? 0 : gamePoints / (GAME_POINTS.win * games))
  }
  const average = (ids: readonly string[], value: (id: string) => number) =>
    ids.length === 0 ? 0 : ids.reduce((sum, id) => sum + value(id), 0) / ids.length
  const opponentMatchWin = (id: string) => average(recordOf(id).opponents, asOpponent)

  const tiebreaker = (id: string, kind: Tiebreaker) => {
    switch (kind) {
      case "opponentMatchWin":
        return opponentMatchWin(id)
      case "gameWin":
        return gameWin(id)
      case "opponentGameWin":
        return average(recordOf(id).opponents, gameWin)
      case "opponentOpponentMatchWin":
        return average(recordOf(id).opponents, opponentMatchWin)
      case "lostRoundSquares":
        return 1 / (1 + recordOf(id).lostRoundSquares)
    }
  }

  const unranked = players.map(({ id }) => {
    const { points, wins, losses, draws } = recordOf(id)
    return {
      playerId: id,
      points,
      wins,
      losses,
      draws,
      tiebreakers: rules.tiebreakers.map((kind) => tiebreaker(id, kind)),
    }
  })
  const compare = (a: (typeof unranked)[number], b: (typeof unranked)[number]) => {
    if (a.points !== b.points) return b.points - a.points
    for (const [index, value] of a.tiebreakers.entries()) {
      const difference = b.tiebreakers[index] - value
      if (Math.abs(difference) > EPSILON) return difference
    }
    return 0
  }
  const sorted = [...unranked].sort(compare)
  const ranks: number[] = []
  for (const [index, standing] of sorted.entries())
    ranks.push(
      index > 0 && compare(sorted[index - 1], standing) === 0 ? ranks[index - 1] : index + 1,
    )
  return sorted.map((standing, index) => ({ ...standing, rank: ranks[index] }))
}
