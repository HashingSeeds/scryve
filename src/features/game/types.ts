import type { PlayerGridLayoutVariant } from "./playerLayouts"
import type { PlaySystemId } from "./playSystems"
import type { PlayerMarkShape } from "../../../convex/lib/appearance"
import type { MatchBestOf } from "../../../convex/lib/matchResults"
import type { TableState } from "../../../convex/lib/table"

export type Brand<T, Name extends string> = T & { readonly __brand: Name }

export type GameId = Brand<string, "GameId">
export type PlayerId = Brand<string, "PlayerId">
export type OperationId = Brand<string, "OperationId">
export type ActorId = Brand<string, "ActorId">
export type DeviceId = Brand<string, "DeviceId">

export type LifeDelta = number
export type GameStatus = "active" | "finished" | "abandoned"

export interface GamePlayer {
  id: PlayerId
  name: string
  color: string
  shape?: PlayerMarkShape
  life: number
  seat: number
}

export type CommanderBoardPlayer = Pick<GamePlayer, "id" | "name" | "color" | "shape">

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

export interface LocalGameAccount {
  ownerId: string
  mePlayerId?: PlayerId
  deckVersionId?: string
  deckName?: string
}

export type MatchSeatOutcome = "win" | "loss" | "draw"

export interface LocalMatchResult {
  outcomes: MatchSeatOutcome[]
}

export interface LocalGameMatch {
  id: string
  bestOf: MatchBestOf
  gameNumber: number
  wins: number[]
  draws: number
  result?: LocalMatchResult
}

export interface LocalGame {
  schemaVersion: 1
  id: GameId
  status: GameStatus
  system?: PlaySystemId
  format?: string
  layout?: PlayerGridLayoutVariant
  lifeStep?: number
  startingLife: number
  players: GamePlayer[]
  events: GameEvent[]
  commanderDamage?: CommanderDamageTotals
  /** why: counters, designations, and Pokémon are current state, not events, so an older build that cannot read them still opens the game. */
  table?: TableState
  createdAt: number
  updatedAt: number
  finishedAt?: number
  result?: LocalGameResult
  account?: LocalGameAccount
  match?: LocalGameMatch
  firstChooserSeat?: number
  firstPlayerOffered?: true
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
  account?: LocalGameAccount
  publish?: "pending" | "published" | "failed"
  skippedBy?: string[]
  match?: LocalGameMatch
  matchPublish?: "pending" | "published" | "failed"
}
