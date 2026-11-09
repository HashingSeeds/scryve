import {
  applyGameCommand,
  asOperationId,
  localLogPositions,
  localTableRules,
  localTeams,
} from "./domain"
import { counterLog, gameLog, mergedLog, rowPosition } from "./LifeLog"
import type { CommandContext, LocalGame } from "./types"
import {
  applyTableAction,
  customCounterNameOf,
  EMPTY_TABLE,
  type TableAction,
} from "../../../convex/lib/table"

/**
 * why: with turns hidden the log shows no passes, so Undo never rewinds a turn the player cannot
 * see. A pass is weighed against the newest row the log shows, so taps that cancel out after it,
 * which show no row, don't hide it.
 */
export function newestLogUndo(game: LocalGame, { turns }: { turns: boolean }) {
  const positionOf = localLogPositions(game)
  const [row] = mergedLog(
    gameLog(game.players, game.events),
    counterLog(game.counterLog ?? []),
    positionOf,
  )
  const turn = turns ? game.turn : undefined
  const passPlace = turn ? (positionOf(turn.operationId) ?? -Infinity) : -Infinity
  if (turn?.previous && (!row || passPlace >= rowPosition(row, positionOf)))
    return {
      kind: "turn" as const,
      playerId: turn.previous.playerId,
      turnOperationId: turn.operationId,
    }
  if (!row) return undefined
  return row.kind === "counter"
    ? {
        kind: "counter" as const,
        playerId: row.playerId,
        counterId: row.counterId,
        delta: row.delta,
        operationIds: row.operationIds,
      }
    : { kind: "life" as const, operationIds: row.operationIds }
}

export type LogUndo = NonNullable<ReturnType<typeof newestLogUndo>>

export function undoLogRow(
  game: LocalGame,
  undo: Exclude<LogUndo, { kind: "turn" }>,
  context: CommandContext,
): LocalGame {
  if (undo.kind === "life")
    return undo.operationIds.reduce(
      (current, operationId) =>
        applyGameCommand(
          current,
          { type: "life.undo", operationId: asOperationId(operationId) },
          context,
        ),
      game,
    )
  const name = customCounterNameOf(undo.counterId)
  const action: TableAction =
    name === undefined
      ? {
          kind: "counter.changed",
          playerId: undo.playerId,
          counterId: undo.counterId,
          delta: -undo.delta,
        }
      : { kind: "customCounter.changed", playerId: undo.playerId, name, delta: -undo.delta }
  const table = game.table ?? EMPTY_TABLE
  // why: a Two-Headed Giant team shares poison, so taking it back moves both heads, as adding it did.
  const teams = localTeams(game)
  const change = applyTableAction(teams ? { ...table, turnGroups: teams } : table, action, {
    rules: localTableRules(game),
    operationId: context.operationId(),
    lifeOf: (playerId) => game.players.find(({ id }) => id === playerId)?.life,
  })
  if (!change) return game
  const { turnGroups: _groups, ...changed } = change.table
  const undone = new Set(undo.operationIds)
  const counterLogLeft = (game.counterLog ?? []).filter(
    ({ operationId }) => !undone.has(operationId),
  )
  const { counterLog: _log, ...rest } = game
  return {
    ...rest,
    table: changed,
    ...(counterLogLeft.length > 0 ? { counterLog: counterLogLeft } : {}),
    updatedAt: Math.max(game.updatedAt, context.now()),
  }
}
