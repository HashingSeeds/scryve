import type { PlaySystemId } from "./playSystems"
import type { PlayerMarkShape } from "../../../convex/lib/appearance"

export type Brand<T, Name extends string> = T & { readonly __brand: Name }

export type GameId = Brand<string, "GameId">
export type PlayerId = Brand<string, "PlayerId">
export type OperationId = Brand<string, "OperationId">
export type ActorId = Brand<string, "ActorId">
export type DeviceId = Brand<string, "DeviceId">

export type LifeDelta = number
export type StartingLife = 20 | 30 | 40 | number
export type GameStatus = "active" | "finished" | "abandoned"

export interface GamePlayer {
  id: PlayerId
  name: string
  color: string
  shape?: PlayerMarkShape
  life: number
  seat: number
}

interface BaseGameEvent {
  operationId: OperationId
  gameId: GameId
  actorId: ActorId
  deviceId: DeviceId
  clientCreatedAt: number
}

export interface LifeChangedEvent extends BaseGameEvent {
  type: "life.changed"
  playerId: PlayerId
  delta: LifeDelta
  compensatesOperationId?: OperationId
}

export interface CommanderDamageAssignedEvent extends BaseGameEvent {
  type: "commanderDamage.assigned"
  fromPlayerId: PlayerId
  toPlayerId: PlayerId
  delta: number
  compensatesOperationId?: OperationId
}

export type LocalGameResult = { kind: "win"; winnerPlayerIds: PlayerId[] } | { kind: "draw" }

export interface GameFinishedEvent extends BaseGameEvent {
  type: "game.finished"
  result?: LocalGameResult
}

export interface GameAbandonedEvent extends BaseGameEvent {
  type: "game.abandoned"
}

export type GameEvent =
  LifeChangedEvent | CommanderDamageAssignedEvent | GameFinishedEvent | GameAbandonedEvent

export type CommanderDamageTotals = Record<string, number>

export interface LocalGame {
  schemaVersion: 1
  id: GameId
  status: GameStatus
  system?: PlaySystemId
  format?: string
  startingLife: number
  players: GamePlayer[]
  events: GameEvent[]
  commanderDamage?: CommanderDamageTotals
  createdAt: number
  updatedAt: number
  finishedAt?: number
  result?: LocalGameResult
}

export interface NewPlayerInput {
  name: string
  color: string
  shape?: PlayerMarkShape
}

export type GameCommand =
  | { type: "life.change"; playerId: PlayerId; delta: LifeDelta }
  | {
      type: "commanderDamage.assign"
      fromPlayerId: PlayerId
      toPlayerId: PlayerId
      delta: number
    }
  | { type: "life.undo" }
  | { type: "game.finish"; result?: LocalGameResult }
  | { type: "game.abandon" }

export interface CommandContext {
  actorId: ActorId
  deviceId: DeviceId
  now: () => number
  operationId: () => OperationId
}

export interface LocalGameSummary {
  schemaVersion: 1
  id: GameId
  status: "finished" | "abandoned"
  system?: PlaySystemId
  format?: string
  startingLife: number
  players: GamePlayer[]
  eventCount: number
  createdAt: number
  finishedAt: number
  result?: LocalGameResult
}
