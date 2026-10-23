import type {
  ClockAction,
  EventClock,
  EventStatus,
  TableStatus,
} from "../../../convex/lib/events/commands"
import type {
  EventPoints,
  EventStructure,
  PlayerStanding,
  TableResult,
} from "../../../convex/lib/events/model"
import type { MatchBestOf } from "../../../convex/lib/matchResults"

export interface EventPlayer {
  readonly id: string
  readonly name: string
  readonly guest: boolean
  readonly dropped: boolean
}

export interface EventTableView {
  readonly id: string
  readonly table: number
  readonly playerIds: readonly string[]
  readonly status: TableStatus
  readonly result: TableResult | null
  readonly reportedBy: string | null
}

export interface EventView {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly system: string
  readonly format: string
  readonly structure: EventStructure
  readonly bestOf: MatchBestOf
  readonly points: EventPoints
  readonly plannedRounds: number
  readonly roundMinutes: number
  readonly status: EventStatus
  readonly round: number
  readonly clock: EventClock | null
  readonly isOrganizer: boolean
  readonly myPlayerId: string | null
  readonly players: readonly EventPlayer[]
  readonly tables: readonly EventTableView[]
}

/** why: a store host device on local Wi-Fi implements this too, so event screens must never reach Convex directly. */
export interface EventSource {
  readonly view: EventView | null | undefined
  readonly standings: readonly PlayerStanding[] | undefined
  update(patch: { name?: string; plannedRounds?: number; roundMinutes?: number }): Promise<void>
  addGuest(name: string): Promise<void>
  dropPlayer(playerId: string): Promise<void>
  undropPlayer(playerId: string): Promise<void>
  startNextRound(): Promise<void>
  report(tableId: string, result: TableResult | null): Promise<void>
  confirm(tableId: string): Promise<void>
  adjustClock(action: ClockAction): Promise<void>
  finish(): Promise<void>
  remove(): Promise<void>
}
