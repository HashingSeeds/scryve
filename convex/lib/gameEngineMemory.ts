import {
  runSync,
  writeGame,
  type CommanderClaimRecord,
  type CommanderPair,
  type EngineGame,
  type EngineSeat,
  type GameChange,
  type GameEventRecord,
  type GameStore,
  type GameWrite,
  type GameWriteResult,
} from "./gameEngine"
import { commanderField, PARTNER_COMMANDER, type SeatActor } from "./gameRules"

export interface MemoryGame extends EngineGame {
  seats: Map<string, EngineSeat & { lastEventAt?: number }>
  events: Map<string, GameEventRecord>
  claims: Map<string, CommanderClaimRecord>
  pairs: Map<string, { total: number; updatedAt: number }>
}

const pairKey = ({ fromPlayerId, toPlayerId, commander }: CommanderPair) =>
  [fromPlayerId, toPlayerId, ...(commander === undefined ? [] : [commander])].join("\u0000")

export const commanderTotals = (game: MemoryGame) =>
  [...game.pairs].map(([key, { total }]) => {
    const [fromPlayerId, toPlayerId, commander] = key.split("\u0000")
    return {
      fromPlayerId,
      toPlayerId,
      ...commanderField(commander ? PARTNER_COMMANDER : undefined),
      total,
    }
  })

export function applyGameChanges(game: MemoryGame, changes: readonly GameChange[]) {
  for (const change of changes) {
    if (change.kind === "seat.patch") {
      const seat = game.seats.get(change.seatId)
      if (seat) game.seats.set(change.seatId, { ...seat, ...change.patch })
    } else if (change.kind === "event.insert")
      game.events.set(change.event.operationId, change.event)
    else if (change.kind === "event.rekey") {
      const event = game.events.get(change.operationId)
      if (!event) continue
      game.events.delete(change.operationId)
      game.events.set(change.to, { ...event, operationId: change.to })
    } else if (change.kind === "claim.insert")
      game.claims.set(change.claim.operationId, change.claim)
    else if (change.kind === "claim.patch") {
      const claim = game.claims.get(change.operationId)
      if (claim) game.claims.set(change.operationId, { ...claim, ...change.patch })
    } else if (change.kind === "pair.put")
      game.pairs.set(pairKey(change), { total: change.total, updatedAt: change.updatedAt })
    else game.designations = change.designations
  }
}

const memoryStore = (game: MemoryGame): GameStore => ({
  game,
  seat: (id) => game.seats.get(id),
  event: (operationId) => game.events.get(operationId),
  claim: (operationId) => game.claims.get(operationId),
  pendingClaims: () => [...game.claims.values()].filter((claim) => claim.status === "pending"),
  pairTotal: (pair) => game.pairs.get(pairKey(pair))?.total ?? 0,
  apply: (changes) => applyGameChanges(game, changes),
})

export const writeMemoryGame = (
  game: MemoryGame,
  identity: Omit<SeatActor, "deviceId">,
  write: GameWrite,
  now: number,
): GameWriteResult => runSync(writeGame(memoryStore(game), identity, write, now))
