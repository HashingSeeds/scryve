import {
  assertCanAddPlayer,
  assertPlannedRounds,
  assertResult,
  assertRoundMinutes,
  assertSettings,
  changeClock,
  confirmResult,
  eventError,
  reportResult,
  startRound,
  type ClockAction,
  type EventActor,
  type EventClock,
  type EventStatus,
  type EventTable,
} from "../../../../convex/lib/events/commands"
import type {
  EventPoints,
  EventSettings,
  EventStructure,
  PlayerStanding,
  TableResult,
} from "../../../../convex/lib/events/model"
import { eventRules } from "../../../../convex/lib/events/rules"
import { computeStandings } from "../../../../convex/lib/events/standings"
import type { MatchBestOf } from "../../../../convex/lib/matchResults"
import { nameFailsGate } from "../../../../convex/lib/nameFilter"
import { assertDisplayName, assertEventName } from "../../../../convex/lib/policy"
import type { EventView } from "../eventSource"

export interface HubPlayer {
  readonly id: string
  readonly name: string
  readonly guest: boolean
  readonly droppedAt?: number
  readonly token?: string
}

export interface HubTable extends EventTable {
  readonly id: string
}

export interface HubEvent {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly system: "mtg"
  readonly format: string
  readonly structure: EventStructure
  readonly bestOf: MatchBestOf
  readonly points: EventPoints
  readonly plannedRounds: number
  readonly roundMinutes: number
  readonly status: EventStatus
  readonly round: number
  readonly clock?: EventClock
  readonly players: readonly HubPlayer[]
  readonly tables: readonly HubTable[]
  readonly createdAt: number
  readonly finishedAt?: number
}

export type HubCommand =
  | {
      readonly kind: "update"
      readonly patch: { name?: string; plannedRounds?: number; roundMinutes?: number }
    }
  | { readonly kind: "addGuest"; readonly name: string }
  | { readonly kind: "drop"; readonly playerId: string }
  | { readonly kind: "undrop"; readonly playerId: string }
  | { readonly kind: "startRound" }
  | { readonly kind: "report"; readonly tableId: string; readonly result: TableResult | null }
  | { readonly kind: "confirm"; readonly tableId: string }
  | { readonly kind: "clock"; readonly action: ClockAction }
  | { readonly kind: "finish" }

const ORGANIZER_ONLY = new Set<HubCommand["kind"]>([
  "update",
  "addGuest",
  "undrop",
  "startRound",
  "clock",
  "finish",
])

const settingsOf = (event: HubEvent): EventSettings => ({
  structure: event.structure,
  bestOf: event.bestOf,
  points: event.points,
})

function checkedName(raw: string, assert: (name: string) => string) {
  const name = assert(raw)
  if (nameFailsGate(name)) throw eventError("name_rejected", "Choose a different name")
  return name
}

export function createHubEvent(
  input: Pick<
    HubEvent,
    "name" | "format" | "structure" | "bestOf" | "plannedRounds" | "roundMinutes"
  > & { id: string; code: string },
  now: number,
): HubEvent {
  const settings = assertSettings({
    structure: input.structure,
    bestOf: input.bestOf,
    points: eventRules("mtg").defaultPoints,
  })
  const name = checkedName(input.name, assertEventName)
  if (!name) throw new Error("Name the event")
  return {
    id: input.id,
    code: input.code,
    name,
    system: "mtg",
    format: input.format,
    ...settings,
    plannedRounds: assertPlannedRounds(input.plannedRounds),
    roundMinutes: assertRoundMinutes(input.roundMinutes),
    status: "registration",
    round: 0,
    players: [],
    tables: [],
    createdAt: now,
  }
}

export function joinHub(
  event: HubEvent,
  device: { name: string; token: string },
  newPlayerId: string,
): { event: HubEvent; playerId: string } {
  const existing = event.players.find((player) => player.token === device.token)
  if (existing) return { event, playerId: existing.id }
  assertCanAddPlayer(event.status, event.players.length)
  const player: HubPlayer = {
    id: newPlayerId,
    name: checkedName(device.name, assertDisplayName),
    guest: false,
    token: device.token,
  }
  return { event: { ...event, players: [...event.players, player] }, playerId: player.id }
}

function playerById(event: HubEvent, playerId: string) {
  const player = event.players.find((candidate) => candidate.id === playerId)
  if (!player) throw new Error("Player not found")
  return player
}

function tableById(event: HubEvent, tableId: string) {
  const table = event.tables.find((candidate) => candidate.id === tableId)
  if (!table) throw new Error("Table not found")
  return table
}

const withTable = (event: HubEvent, table: HubTable): HubEvent => ({
  ...event,
  tables: event.tables.map((candidate) => (candidate.id === table.id ? table : candidate)),
})

const withPlayer = (event: HubEvent, player: HubPlayer): HubEvent => ({
  ...event,
  players: event.players.map((candidate) => (candidate.id === player.id ? player : candidate)),
})

function assertOpen(event: HubEvent) {
  if (event.status === "finished") throw eventError("event_finished", "This event has finished")
}

export function applyHubCommand(
  event: HubEvent,
  actor: EventActor,
  command: HubCommand,
  now: number,
  random: () => number = Math.random,
): HubEvent {
  if (actor.kind !== "organizer" && ORGANIZER_ONLY.has(command.kind))
    throw new Error("Only the organizer can do that")
  switch (command.kind) {
    case "update": {
      assertOpen(event)
      const { name, plannedRounds, roundMinutes } = command.patch
      const checked = name === undefined ? undefined : checkedName(name, assertEventName)
      if (checked === "") throw new Error("Name the event")
      return {
        ...event,
        ...(checked === undefined ? {} : { name: checked }),
        ...(plannedRounds === undefined
          ? {}
          : { plannedRounds: assertPlannedRounds(plannedRounds) }),
        ...(roundMinutes === undefined ? {} : { roundMinutes: assertRoundMinutes(roundMinutes) }),
      }
    }
    case "addGuest": {
      assertCanAddPlayer(event.status, event.players.length)
      const guest: HubPlayer = {
        id: `guest-${now}-${event.players.length}`,
        name: checkedName(command.name, assertDisplayName),
        guest: true,
      }
      return { ...event, players: [...event.players, guest] }
    }
    case "drop": {
      const player = playerById(event, command.playerId)
      if (actor.kind === "player" && actor.playerId !== player.id)
        throw new Error("Only the organizer can drop another player")
      assertOpen(event)
      if (event.round === 0)
        return { ...event, players: event.players.filter(({ id }) => id !== player.id) }
      return player.droppedAt === undefined
        ? withPlayer(event, { ...player, droppedAt: now })
        : event
    }
    case "undrop": {
      assertOpen(event)
      const { droppedAt: _, ...player } = playerById(event, command.playerId)
      return withPlayer(event, player)
    }
    case "startRound": {
      const next = startRound({
        status: event.status,
        round: event.round,
        players: event.players.map((player) => ({
          id: player.id,
          dropped: player.droppedAt !== undefined,
        })),
        tables: event.tables,
        settings: settingsOf(event),
        random,
      })
      return {
        ...event,
        status: "active",
        round: next.round,
        clock: { startedAt: now, durationMs: event.roundMinutes * 60_000 },
        tables: [
          ...event.tables,
          ...next.tables.map((table) => ({ ...table, id: `${table.round}-${table.table}` })),
        ],
      }
    }
    case "report": {
      const table = tableById(event, command.tableId)
      const result =
        command.result && assertResult(table, command.result, settingsOf(event), eventRules("mtg"))
      // why: a guest's message is untrusted, and assertResult returns nothing for a kind it doesn't know.
      if (result === undefined) throw new Error("Enter a valid result")
      const patch = reportResult({ status: event.status, round: event.round, table }, actor, result)
      return withTable(event, { ...table, ...patch })
    }
    case "confirm": {
      const table = tableById(event, command.tableId)
      const patch = confirmResult({ status: event.status, round: event.round, table }, actor)
      return withTable(event, { ...table, ...patch })
    }
    case "clock":
      if (event.status !== "active" || !event.clock) throw new Error("No round is running")
      return { ...event, clock: changeClock(event.clock, command.action, now) }
    case "finish": {
      if (event.status === "finished") return event
      const { clock: _, ...rest } = event
      return { ...rest, status: "finished", finishedAt: now }
    }
  }
}

export function hubView(
  event: HubEvent,
  viewer: { organizer: boolean; playerId: string | null },
): EventView {
  return {
    id: event.id,
    code: event.code,
    name: event.name,
    system: event.system,
    format: event.format,
    structure: event.structure,
    bestOf: event.bestOf,
    points: event.points,
    plannedRounds: event.plannedRounds,
    roundMinutes: event.roundMinutes,
    status: event.status,
    round: event.round,
    clock: event.clock ?? null,
    isOrganizer: viewer.organizer,
    myPlayerId: viewer.playerId,
    players: event.players.map((player) => ({
      id: player.id,
      name: player.name,
      guest: player.guest,
      dropped: player.droppedAt !== undefined,
    })),
    tables: event.tables
      .filter((table) => table.round === event.round)
      .map((table) => ({
        id: table.id,
        table: table.table,
        playerIds: table.playerIds,
        status: table.status,
        result: table.result ?? null,
        reportedBy: table.reportedBy ?? null,
      }))
      .sort((a, b) => a.table - b.table),
  }
}

export function hubStandings(event: HubEvent, throughRound: number): readonly PlayerStanding[] {
  return computeStandings({
    players: event.players.map((player) => ({
      id: player.id,
      dropped: player.droppedAt !== undefined,
    })),
    tables: event.tables.filter((table) => table.round <= throughRound),
    settings: settingsOf(event),
    rules: eventRules("mtg"),
  })
}
