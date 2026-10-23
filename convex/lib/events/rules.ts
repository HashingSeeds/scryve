import type { SystemId } from "../systems"
import type { EventPoints } from "./model"

export type Tiebreaker =
  | "opponentMatchWin"
  | "gameWin"
  | "opponentGameWin"
  | "opponentOpponentMatchWin"
  | "lostRoundSquares"

export interface EventRules {
  readonly tiebreakers: readonly Tiebreaker[]
  readonly winPercent: "matchPoints" | "winsWithoutByes"
  readonly winPercentFloor: number
  readonly droppedWinPercentCap?: number
  readonly draws: boolean
  readonly doubleLoss: boolean
  readonly defaultPoints: EventPoints
}

const MAGIC: EventRules = {
  tiebreakers: ["opponentMatchWin", "gameWin", "opponentGameWin"],
  winPercent: "matchPoints",
  winPercentFloor: 1 / 3,
  draws: true,
  doubleLoss: false,
  defaultPoints: { win: 3, draw: 1, loss: 0 },
}

const RULES: Record<SystemId, EventRules> = {
  mtg: MAGIC,
  lorcana: MAGIC,
  fab: MAGIC,
  pokemon: {
    tiebreakers: ["opponentMatchWin", "opponentOpponentMatchWin"],
    winPercent: "winsWithoutByes",
    winPercentFloor: 0.25,
    droppedWinPercentCap: 0.75,
    draws: true,
    doubleLoss: false,
    defaultPoints: { win: 3, draw: 1, loss: 0 },
  },
  ygo: {
    tiebreakers: ["opponentMatchWin", "opponentOpponentMatchWin", "lostRoundSquares"],
    winPercent: "matchPoints",
    winPercentFloor: 0,
    draws: false,
    doubleLoss: true,
    defaultPoints: { win: 3, draw: 0, loss: 0 },
  },
}

export function eventRules(system: SystemId): EventRules {
  return RULES[system]
}
