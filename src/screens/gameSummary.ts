import type { LifeChangedEvent, LocalGame } from "@/features/game/types"

import type { HistorySource } from "./historyEntries"

export type SummaryOutcome = "win" | "loss" | "draw" | "unrecorded"

export interface SummaryPlayer {
  id: string
  seat: number
  name: string
  username?: string
  deckLabel?: string
  color: string
  life: number
  outcome: SummaryOutcome
  deleted?: boolean
}

export interface SummaryChange {
  id: string
  playerId?: string
  delta: number
  undo?: boolean
}

export interface GameSummaryModel {
  source: HistorySource
  status: "finished" | "abandoned"
  finishedAt?: number
  startedAt?: number
  startingLife?: number
  format: string
  changeCount: number
  players: SummaryPlayer[]
  terminalReason?: string
}

export interface SummaryChangeFeed {
  changes: SummaryChange[]
  onExpand?: () => void
  canLoadMore?: boolean
  loadMore?: () => void
  olderEventsDropped?: boolean
}

const OUTCOME_ORDER: Record<SummaryOutcome, number> = { win: 0, draw: 1, loss: 2, unrecorded: 3 }

export function localOutcome(result: LocalGame["result"], playerId: string): SummaryOutcome {
  if (!result) return "unrecorded"
  if (result.kind === "draw") return "draw"
  return result.winnerPlayerIds.some((id) => id === playerId) ? "win" : "loss"
}

export function localSummaryModel(game: LocalGame): GameSummaryModel {
  return {
    source: "local",
    status: game.status === "abandoned" ? "abandoned" : "finished",
    finishedAt: game.finishedAt ?? game.updatedAt,
    startedAt: game.createdAt,
    startingLife: game.startingLife,
    format: `${game.startingLife} life`,
    changeCount: localChanges(game).length,
    players: game.players.map((player) => ({
      id: player.id,
      seat: player.seat + 1,
      name: player.name,
      color: player.color,
      life: player.life,
      outcome: localOutcome(game.result, player.id),
    })),
  }
}

export function localChanges(game: LocalGame): SummaryChange[] {
  return game.events
    .filter((event): event is LifeChangedEvent => event.type === "life.changed")
    .map((event) => ({
      id: event.operationId,
      playerId: event.playerId,
      delta: event.delta,
      undo: Boolean(event.compensatesOperationId),
    }))
}

export interface ConnectedSummaryDocument {
  terminalStatus?: "finished" | "abandoned"
  terminalReason?: string
  startingLife: number
  ruleset: string
  eventCount: number
  finishedAt: number
  players: {
    playerId: string
    seat: number
    displayName: string
    usernameAtFinish?: string
    deckNameAtFinish?: string
    deckVersionNumber?: number
    outcome?: "win" | "loss" | "draw" | "unknown"
    color: string
    finalLife: number
    deletedAt?: number
  }[]
}

export function connectedSummaryModel(summary: ConnectedSummaryDocument): GameSummaryModel {
  return {
    source: "connected",
    status: summary.terminalStatus === "abandoned" ? "abandoned" : "finished",
    finishedAt: summary.finishedAt,
    startingLife: summary.startingLife,
    format: summary.ruleset,
    changeCount: summary.eventCount,
    terminalReason: summary.terminalReason,
    players: summary.players.map((player) => ({
      id: player.playerId,
      seat: player.seat,
      name: player.displayName,
      username:
        player.usernameAtFinish === player.displayName ? undefined : player.usernameAtFinish,
      deckLabel: player.deckNameAtFinish
        ? player.deckVersionNumber
          ? `${player.deckNameAtFinish} v${player.deckVersionNumber}`
          : player.deckNameAtFinish
        : undefined,
      color: player.color,
      life: player.finalLife,
      outcome:
        player.outcome === "win" || player.outcome === "loss" || player.outcome === "draw"
          ? player.outcome
          : "unrecorded",
      deleted: Boolean(player.deletedAt),
    })),
  }
}

export function connectedChanges(
  events: { operationId: string; playerId?: string; kind: string; delta?: number }[],
): SummaryChange[] {
  return events
    .filter((event) => event.kind === "life.changed" && typeof event.delta === "number")
    .map((event) => ({
      id: event.operationId,
      playerId: event.playerId,
      delta: event.delta as number,
    }))
}

export function standings(model: GameSummaryModel) {
  return [...model.players].sort(
    (a, b) => OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] || a.seat - b.seat,
  )
}

export function anyResultRecorded(model: GameSummaryModel) {
  return model.players.some((player) => player.outcome !== "unrecorded")
}

export function playedFor(model: GameSummaryModel) {
  if (!model.startedAt || !model.finishedAt) return undefined
  const minutes = Math.max(0, Math.round((model.finishedAt - model.startedAt) / 60_000))
  if (minutes < 1) return "Under a minute"
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export function finishedOnLabel(finishedAt?: number) {
  if (!finishedAt) return undefined
  const date = new Date(finishedAt)
  const day = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `${day} · ${time}`
}

export function metaLine(model: GameSummaryModel) {
  return [
    `${model.players.length} player${model.players.length === 1 ? "" : "s"}`,
    model.format,
    playedFor(model),
    `${model.changeCount} life change${model.changeCount === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function netSwing(player: SummaryPlayer, startingLife?: number) {
  return startingLife === undefined ? undefined : player.life - startingLife
}
