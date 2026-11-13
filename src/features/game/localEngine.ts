import type { CommanderSlot, LocalGame, PlayerId } from "./types"
import type { GameWrite } from "../../../convex/lib/gameEngine"
import {
  applyGameChanges,
  writeMemoryGame,
  type MemoryGame,
} from "../../../convex/lib/gameEngineMemory"
import { PARTNER_COMMANDER } from "../../../convex/lib/gameRules"
import { EMPTY_TABLE, seatTable, type TableState } from "../../../convex/lib/table"
import { turnGroupOf } from "../../../convex/lib/turns"

const TABLE = { userId: "table", isHost: true }
const DEVICE = "local-table"

export const COMMANDER_SLOTS: readonly CommanderSlot[] = [undefined, PARTNER_COMMANDER]

export const commanderDamageKey = (
  fromPlayerId: PlayerId,
  toPlayerId: PlayerId,
  commander?: CommanderSlot,
): string =>
  commander ? `${fromPlayerId}#${commander}>${toPlayerId}` : `${fromPlayerId}>${toPlayerId}`

type Sent<Write> = Write extends GameWrite ? Omit<Write, "deviceId" | "clientCreatedAt"> : never
export type LocalWrite = Sent<Extract<GameWrite, { kind: "life" | "table" | "commander.claim" }>>

/** why: the board picks the next seat clockwise by its layout, which the saved game does not hold, so a pass lists that pick right after the seat passing. */
function seatOrder(game: LocalGame, write: LocalWrite) {
  const ids = game.players.map(({ id }) => id as string)
  if (write.kind !== "table" || write.action.kind !== "turn.passed" || !game.turn) return ids
  const first = [
    ...turnGroupOf(game.turnGroups, game.turn.playerId),
    ...turnGroupOf(game.turnGroups, write.action.toPlayerId),
  ]
  return [...new Set([...first.filter((id) => ids.includes(id)), ...ids])]
}

function memoryOf(game: LocalGame, order: readonly string[], undoOf?: string): MemoryGame {
  const table = game.table ?? EMPTY_TABLE
  const lives = new Map(game.players.map(({ id, life }) => [id as string, life]))
  const memory: MemoryGame = {
    status: game.status,
    system: game.system,
    format: game.format,
    designations: table.designations,
    lifeEditing: "anyone",
    ...(game.turn ? { turn: game.turn } : {}),
    ...(game.turnGroups ? { turnGroups: game.turnGroups } : {}),
    ...(table.modes ? { modes: table.modes } : {}),
    ...(game.variant ? { variant: game.variant } : {}),
    seats: new Map(
      order.map((id) => [id, { id, currentLife: lives.get(id) ?? 0, ...table.players[id] }]),
    ),
    events: new Map(),
    claims: new Map(),
    pairs: new Map(),
  }
  // why: the engine reads past changes only to check an undo, so a long game costs a plain tap nothing.
  for (const event of undoOf === undefined ? [] : game.events) {
    if (event.type !== "life.changed" && event.type !== "commanderDamage.assigned") continue
    if (event.operationId !== undoOf && event.compensatesOperationId !== undoOf) continue
    const stamp = {
      operationId: event.operationId,
      actorUserId: TABLE.userId,
      clientCreatedAt: event.clientCreatedAt,
      ...(event.compensatesOperationId ? { undoOfOperationId: event.compensatesOperationId } : {}),
    }
    if (event.type === "life.changed") {
      memory.events.set(event.operationId, {
        ...stamp,
        playerId: event.playerId,
        kind: "life.changed",
        delta: event.delta,
        serverCreatedAt: event.clientCreatedAt,
      })
      continue
    }
    memory.events.set(event.operationId, {
      ...stamp,
      playerId: event.toPlayerId,
      kind: "commanderDamage.claimed",
      serverCreatedAt: event.clientCreatedAt,
    })
    memory.claims.set(event.operationId, {
      operationId: event.operationId,
      fromPlayerId: event.fromPlayerId,
      toPlayerId: event.toPlayerId,
      ...(event.commander ? { commander: event.commander } : {}),
      delta: event.delta,
      status: "confirmed",
      actorUserId: TABLE.userId,
      clientCreatedAt: event.clientCreatedAt,
      createdAt: event.clientCreatedAt,
    })
  }
  applyGameChanges(
    memory,
    game.players.flatMap((from) =>
      game.players.flatMap((to) =>
        COMMANDER_SLOTS.flatMap((commander) => {
          const total = game.commanderDamage?.[commanderDamageKey(from.id, to.id, commander)]
          return total === undefined
            ? []
            : [
                {
                  kind: "pair.put" as const,
                  fromPlayerId: from.id,
                  toPlayerId: to.id,
                  ...(commander ? { commander } : {}),
                  total,
                  updatedAt: game.updatedAt,
                },
              ]
        }),
      ),
    ),
  )
  return memory
}

// why: the Pokémon seats memoize on the table object, so it only changes when the table itself does.
function tableAfter(game: LocalGame, memory: MemoryGame): TableState | undefined {
  const before = game.table ?? EMPTY_TABLE
  let changed = memory.designations !== before.designations || memory.modes !== before.modes
  const players: TableState["players"] = {}
  for (const seat of memory.seats.values()) {
    const was = before.players[seat.id]
    const same =
      was?.counters === seat.counters &&
      was?.customCounters === seat.customCounters &&
      was?.pokemon === seat.pokemon
    if (!same) changed = true
    const now = same ? was : seatTable(seat)
    if (now) players[seat.id] = now
  }
  if (!changed) return game.table
  const { modes: _modes, ...rest } = before
  return {
    ...rest,
    players,
    designations: memory.designations,
    ...(memory.modes ? { modes: memory.modes } : {}),
  }
}

export function writeLocalGame(game: LocalGame, write: LocalWrite, now: number) {
  const memory = memoryOf(game, seatOrder(game, write), write.undoOf)
  const result = writeMemoryGame(
    memory,
    TABLE,
    { ...write, deviceId: DEVICE, clientCreatedAt: now },
    now,
  )
  if (!result.ok || (write.kind === "commander.claim" && result.ack.status !== "confirmed"))
    return null
  const moved = game.players.some(({ id, life }) => memory.seats.get(id)?.currentLife !== life)
  return {
    players: moved
      ? game.players.map((player) => {
          const life = memory.seats.get(player.id)?.currentLife ?? player.life
          return life === player.life ? player : { ...player, life }
        })
      : game.players,
    table: tableAfter(game, memory),
    turn: memory.turn,
    total: result.ack.total,
  }
}
