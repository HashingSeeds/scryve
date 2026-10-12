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

/** why: life stays out so another seat's life change does not re-render commander boards and strips on every card. */
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

/** why: ties a local game to the signed-in account that will publish it, and to that account's seat. */
export interface LocalGameAccount {
  ownerId: string
  mePlayerId?: PlayerId
  deckVersionId?: string
  deckName?: string
}

export type MatchSeatOutcome = "win" | "loss" | "draw"

/** why: outcomes are by seat index because every game of a match seats the same players in the same order. */
export interface LocalMatchResult {
  outcomes: MatchSeatOutcome[]
}

/** why: a match lives on each of its games, so the score survives the new game id a rematch creates. */
export interface LocalGameMatch {
  id: string
  bestOf: MatchBestOf
  gameNumber: number
  /** why: wins per seat index and drawn games before this game. */
  wins: number[]
  draws: number
  /** why: set on the game that ended the match, by reaching the needed wins or by the player ending it. */
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
  /** why: a finished game owned by an account uploads once; the flag survives restarts until the server acks or rejects it. */
  publish?: "pending" | "published" | "failed"
  /** why: accounts that declined to claim a signed-out game, so a later sign-in picker can skip it. */
  skippedBy?: string[]
  match?: LocalGameMatch
  /** why: the game that ended a match also carries the match result upload, which waits for every game's ack and is dropped when a game was rejected. */
  matchPublish?: "pending" | "published" | "failed"
}
