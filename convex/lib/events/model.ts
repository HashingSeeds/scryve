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
  readonly bestOf: MatchBestOf
  readonly points: EventPoints
}

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
  readonly rank: number
  readonly points: number
  readonly wins: number
  readonly losses: number
  readonly draws: number
  readonly tiebreakers: readonly number[]
}

export interface PairingInput {
  readonly players: readonly EventPlayerState[]
  readonly tables: readonly EventTableState[]
  readonly settings: EventSettings
  readonly random: () => number
}

export type RoundPairings = readonly (readonly string[])[]
