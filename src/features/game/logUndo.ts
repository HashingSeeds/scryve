import {
  applyGameCommand,
  applyLocalTableAction,
  asOperationId,
  localLogPositions,
  localTableRules,
  localTeams,
} from "./domain"
import { counterLog, gameLog, mergedLog, rowPosition } from "./LifeLog"
import { withRoundClockAfter } from "./roundClock"
import type { CommandContext, LocalGame } from "./types"
import {
  applyTableAction,
  customCounterNameOf,
  EMPTY_TABLE,
  type TableAction,
} from "../../../convex/lib/table"

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

export function undoLogStep(game: LocalGame, undo: LogUndo, context: CommandContext): LocalGame {
  if (undo.kind !== "turn") return undoLogRow(game, undo, context)
  const operationId = context.operationId()
  const action: TableAction = {
    kind: "turn.undone",
    playerId: undo.playerId,
    turnOperationId: undo.turnOperationId,
  }
  const undone = applyLocalTableAction(game, action, { operationId, now: context.now() })
  return undone === game ? game : withRoundClockAfter(undone, action, operationId)
}

/** why: modes have no undo and a turn keeps only its own pass, so going back past either would leave it standing. */
export function rollbackFloor(game: LocalGame, { turns }: { turns: boolean }) {
  if (game.status !== "active") return Infinity
  const positionOf = localLogPositions(game)
  const placeOf = (operationId: string | undefined) =>
    operationId === undefined ? -Infinity : (positionOf(operationId) ?? -Infinity)
  const turn = turns ? game.turn : undefined
  return Math.max(
    placeOf(turn?.previous?.operationId ?? turn?.operationId),
    ...(game.table?.modes?.log ?? []).map(({ operationId }) => placeOf(operationId)),
  )
}

export function rollBack(
  game: LocalGame,
  place: number,
  { turns }: { turns: boolean },
  context: CommandContext,
) {
  if (place <= rollbackFloor(game, { turns })) return { game, changes: 0 }
  // why: undo trims logOrder, so later steps are placed by the log as it stood when the rollback began.
  const positionOf = localLogPositions(game)
  const placeOf = (undo: LogUndo) =>
    undo.kind === "turn"
      ? (positionOf(undo.turnOperationId) ?? -Infinity)
      : rowPosition(undo, positionOf)
  let current = game
  let changes = 0
  for (
    let undo = newestLogUndo(current, { turns });
    undo && placeOf(undo) >= place;
    undo = newestLogUndo(current, { turns })
  ) {
    const next = undoLogStep(current, undo, context)
    if (next === current) break
    current = next
    changes += 1
  }
  return { game: current, changes }
}
