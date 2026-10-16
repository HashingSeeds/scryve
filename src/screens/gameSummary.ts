import type { NextPageState, RemoteValue } from "@/features/async/remoteState"
import {
  counterChangeLabel,
  counterValueLabel,
  isPlaySystemId,
  playFormatLabel,
  storedPlaySystem,
  type PlaySystemId,
} from "@/features/game/playSystems"
import type {
  CommanderDamageAssignedEvent,
  LifeChangedEvent,
  LocalGame,
} from "@/features/game/types"
import { appLocale, type TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"

import type { HistoryOutcome, HistorySource } from "./historyEntries"

export type SummaryOutcome = HistoryOutcome

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
  system?: PlaySystemId
  format: string
  changeCount: number
  players: SummaryPlayer[]
  terminalReason?: string
}

export interface SummaryChangeFeed {
  status: "ready"
  items: readonly SummaryChange[]
  nextPage: NextPageState
  olderEventsDropped?: boolean
}

export type SummaryTimelineState =
  | { status: "idle"; request: () => void }
  | { status: "loading" }
  | SummaryChangeFeed
  | { status: "error"; retry: () => void }
  | { status: "unavailable" }

export type GameSummaryState =
  RemoteValue<GameSummaryModel | null> | { status: "unavailable"; retry: () => void }

const OUTCOME_ORDER: Record<SummaryOutcome, number> = { win: 0, draw: 1, loss: 2, unrecorded: 3 }

export function localOutcome(result: LocalGame["result"], playerId: string): SummaryOutcome {
  if (!result) return "unrecorded"
  if (result.kind === "draw") return "draw"
  return result.winnerPlayerIds.some((id) => id === playerId) ? "win" : "loss"
}

export function localSummaryModel(game: LocalGame): GameSummaryModel {
  const system = isPlaySystemId(game.system) ? game.system : undefined
  return {
    source: "local",
    status: game.status === "abandoned" ? "abandoned" : "finished",
    finishedAt: game.finishedAt ?? game.updatedAt,
    startedAt: game.createdAt,
    startingLife: game.startingLife,
    system,
    format:
      system && game.format
        ? playFormatLabel(system, game.format)
        : counterValueLabel(system, game.startingLife),
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
    .filter(
      (event): event is LifeChangedEvent | CommanderDamageAssignedEvent =>
        event.type === "life.changed" || event.type === "commanderDamage.assigned",
    )
    .map((event) => ({
      id: event.operationId,
      ...(event.type === "life.changed"
        ? { playerId: event.playerId, delta: event.delta }
        : { playerId: event.toPlayerId, delta: -event.delta }),
      undo: Boolean(event.compensatesOperationId),
    }))
}

export interface ConnectedSummaryDocument {
  terminalStatus?: "finished" | "abandoned"
  terminalReason?: string
  startingLife: number
  system?: string
  format?: string
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

const UNUSUAL_ENDING_TX = new Map<string, TxKeyPath>([
  ["host_abandoned", "play:summary.endedHostAbandoned"],
  ["stale_inactivity", "play:summary.endedInactivity"],
  ["account_deleted", "play:summary.endedAccountDeleted"],
])

function unusualEnding(reason: string | undefined) {
  const key = UNUSUAL_ENDING_TX.get(reason ?? "")
  return key ? translate(key) : undefined
}

export function connectedSummaryModel(summary: ConnectedSummaryDocument): GameSummaryModel {
  const system = storedPlaySystem(summary.system)
  return {
    source: "connected",
    status: summary.terminalStatus === "abandoned" ? "abandoned" : "finished",
    finishedAt: summary.finishedAt,
    startingLife: summary.startingLife,
    system,
    format: system
      ? playFormatLabel(system, summary.format || summary.ruleset)
      : counterValueLabel(system, summary.startingLife),
    changeCount: summary.eventCount,
    terminalReason: unusualEnding(summary.terminalReason),
    players: summary.players.map((player) => ({
      id: player.playerId,
      seat: player.seat,
      name: player.displayName,
      username:
        player.usernameAtFinish === player.displayName ? undefined : player.usernameAtFinish,
      deckLabel: player.deckNameAtFinish
        ? player.deckVersionNumber
          ? translate("play:summary.deckVersion", {
              name: player.deckNameAtFinish,
              version: player.deckVersionNumber,
            })
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
  events: readonly { operationId: string; playerId?: string; kind: string; delta?: number }[],
): SummaryChange[] {
  return events.flatMap((event) =>
    event.kind === "life.changed" && typeof event.delta === "number"
      ? [
          {
            id: event.operationId,
            playerId: event.playerId,
            delta: event.delta,
          },
        ]
      : [],
  )
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
  if (minutes < 1) return translate("play:summary.underAMinute")
  if (minutes < 60) return translate("play:summary.minutes", { minutes })
  return translate("play:summary.hoursMinutes", {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  })
}

export function finishedOnLabel(finishedAt?: number) {
  if (!finishedAt) return undefined
  const date = new Date(finishedAt)
  const day = date.toLocaleDateString(appLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const time = date.toLocaleTimeString(appLocale, { hour: "numeric", minute: "2-digit" })
  return `${day} · ${time}`
}

export function metaLine(model: GameSummaryModel) {
  return [
    translate("play:summary.playerCount", { count: model.players.length }),
    model.format,
    playedFor(model),
    counterChangeLabel(model.system, model.changeCount),
  ]
    .filter(Boolean)
    .join(" · ")
}
