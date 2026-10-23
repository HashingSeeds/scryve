import type { MatchBestOf } from "../matchResults"

export const EVENT_STRUCTURES = ["swiss", "pods"] as const
export type EventStructure = (typeof EVENT_STRUCTURES)[number]

export const MAX_EVENT_PLAYERS = 128
export const MAX_EVENT_ROUNDS = 15
export const MIN_POD_SIZE = 3
export const MAX_POD_SIZE = 5

export interface EventPoints {
  readonly win: number
  readonly draw: number
  readonly loss: number
}

export interface EventSettings {
  readonly structure: EventStructure
  /** Pod events play one game per round. */
  readonly bestOf: MatchBestOf
  readonly points: EventPoints
}

/** Seats index into the table's `playerIds`. */
export type TableResult =
  | { readonly kind: "match"; readonly gamesWon: readonly number[]; readonly gamesDrawn: number }
  | { readonly kind: "pod"; readonly winnerSeat: number | null }
  | { readonly kind: "doubleLoss" }
  | { readonly kind: "bye" }

export interface EventTableState {
  readonly round: number
  readonly table: number
  readonly playerIds: readonly string[]
  readonly result?: TableResult
}

export interface EventPlayerState {
  readonly id: string
  readonly dropped: boolean
}

export type TableOutcome = "win" | "loss" | "draw"

export interface PlayerStanding {
  readonly playerId: string
  /** Players with identical points and tiebreakers share a rank. */
  readonly rank: number
  readonly points: number
  readonly wins: number
  readonly losses: number
  readonly draws: number
  /** In the order of the system's `EventRules.tiebreakers`, each 0 to 1. */
  readonly tiebreakers: readonly number[]
}

export interface PairingInput {
  readonly players: readonly EventPlayerState[]
  /** Every earlier table of the event, finished or not. */
  readonly tables: readonly EventTableState[]
  readonly settings: EventSettings
  readonly random: () => number
}

/** Each entry is one table's player ids in seat order. A bye is a one-player table and comes last. */
export type RoundPairings = readonly (readonly string[])[]
