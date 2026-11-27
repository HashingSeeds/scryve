import { counterOutReason } from "@/components/CounterChips"
import { lastChangeRow } from "@/components/LifeStrip"
import type { NextPageState, RemoteValue } from "@/features/async/remoteState"
import { gameTypeLabel } from "@/features/game/gameTypes"
import {
  isPlaySystemId,
  playFormatLabel,
  playSystemRules,
  storedPlaySystem,
  type PlaySystemId,
} from "@/features/game/playSystems"
import { teamName } from "@/features/game/teams"
import type {
  CommanderDamageAssignedEvent,
  LifeChangedEvent,
  LocalGame,
} from "@/features/game/types"
import { type TxKeyPath } from "@/i18n"
import { formatConjunction, formatDate, formatTime, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"

import { noFormatLabel, type HistoryOutcome, type HistorySource } from "./historyEntries"
import { isPlayerMarkShape, type PlayerMarkShape } from "../../convex/lib/appearance"
import type { GameRecap } from "../../convex/lib/gameRecap"
import type { GameVariant } from "../../convex/lib/treachery"
import { turnGroupOf, type TurnGroups } from "../../convex/lib/turns"

export type SummaryOutcome = HistoryOutcome

export interface SummaryPlayer {
  id: string
  seat: number
  name: string
  username?: string
  deckLabel?: string
  color: string
  shape?: PlayerMarkShape
  life: number
  startingLife?: number
  outcome: SummaryOutcome
  deleted?: boolean
  team?: string
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
  logged?: true
  recap?: GameRecap
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

export function localSummaryModel(game: LocalGame, recap?: GameRecap): GameSummaryModel {
  const system = isPlaySystemId(game.system) ? game.system : undefined
  const finishedAt = game.finishedAt ?? game.updatedAt
  return {
    source: "local",
    status: game.status === "abandoned" ? "abandoned" : "finished",
    finishedAt,
    ...(game.logged && game.createdAt === finishedAt ? {} : { startedAt: game.createdAt }),
    startingLife: game.startingLife,
    system,
    format:
      system && game.format
        ? game.variant
          ? gameTypeLabel({ id: game.variant, system, format: game.format, variant: game.variant })
          : playFormatLabel(system, game.format)
        : noFormatLabel(system, game.startingLife, game.logged),
    changeCount: localChanges(game).length,
    ...(recap ? { recap } : {}),
    players: [...game.players]
      .sort((left, right) => left.seat - right.seat)
      .map((player) => ({
        id: player.id,
        seat: player.seat + 1,
        name: player.name,
        color: player.color,
        ...(player.shape ? { shape: player.shape } : {}),
        life: player.life,
        ...(player.startingLife === undefined ? {} : { startingLife: player.startingLife }),
        outcome: localOutcome(game.result, player.id),
        ...teamOf(game.players, game.turnGroups, player.id),
      })),
    ...(game.logged ? { logged: true as const } : {}),
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
  variant?: GameVariant
  ruleset: string
  eventCount: number
  startedAt?: number
  finishedAt: number
  logged?: true
  turnGroups?: string[][]
  recap?: GameRecap
  players: {
    playerId: string
    seat: number
    displayName: string
    usernameAtFinish?: string
    deckNameAtFinish?: string
    deckVersionNumber?: number
    outcome?: "win" | "loss" | "draw" | "unknown"
    color: string
    shape?: string
    finalLife: number
    startingLife?: number
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
    ...(summary.startedAt === undefined ? {} : { startedAt: summary.startedAt }),
    startingLife: summary.startingLife,
    system,
    format: system
      ? summary.variant
        ? gameTypeLabel({
            id: summary.variant,
            system,
            format: summary.format || summary.ruleset,
            variant: summary.variant,
          })
        : playFormatLabel(system, summary.format || summary.ruleset)
      : noFormatLabel(system, summary.startingLife, summary.logged),
    changeCount: summary.eventCount,
    terminalReason: unusualEnding(summary.terminalReason),
    ...(summary.logged ? { logged: true as const } : {}),
    ...(summary.recap ? { recap: summary.recap } : {}),
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
      ...(isPlayerMarkShape(player.shape) ? { shape: player.shape } : {}),
      life: player.finalLife,
      ...(player.startingLife === undefined ? {} : { startingLife: player.startingLife }),
      outcome:
        player.outcome === "win" || player.outcome === "loss" || player.outcome === "draw"
          ? player.outcome
          : "unrecorded",
      deleted: Boolean(player.deletedAt),
      ...teamOf(
        summary.players.map(({ playerId, displayName }) => ({ id: playerId, name: displayName })),
        summary.turnGroups,
        player.playerId,
      ),
    })),
  }
}

function teamOf(
  players: readonly { id: string; name: string }[],
  groups: TurnGroups | undefined,
  playerId: string,
) {
  return turnGroupOf(groups, playerId).length > 1
    ? { team: teamName(players, groups, playerId) }
    : {}
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

export function recapOut(model: GameSummaryModel, player: SummaryPlayer) {
  return model.recap?.outs?.find(({ seat }) => model.players[seat] === player)
}

function lastInRow(model: GameSummaryModel, player: SummaryPlayer) {
  if (!recapOut(model, player)) return Number.MAX_SAFE_INTEGER
  const lives = model.recap?.lives
  return lives ? lastChangeRow(lives, model.players.indexOf(player)) : 0
}

export function standings(model: GameSummaryModel) {
  return [...model.players].sort(
    (a, b) =>
      OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome] ||
      lastInRow(model, b) - lastInRow(model, a) ||
      a.seat - b.seat,
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

export function finishedOnLabel(finishedAt?: number, logged?: true) {
  if (!finishedAt) return undefined
  return joinParts([
    formatDate(finishedAt, { month: "short", day: "numeric", year: "numeric" }),
    logged ? undefined : formatTime(finishedAt),
  ])
}

export function metaLine(model: GameSummaryModel) {
  return joinParts([
    finishedOnLabel(model.finishedAt, model.logged),
    model.logged ? translate("play:history.logged") : undefined,
    model.format,
    playedFor(model),
  ])
}

export function recapDetail(model: GameSummaryModel, player: SummaryPlayer) {
  const out = recapOut(model, player)
  if (!out)
    return player.outcome === "win" || player.outcome === "draw"
      ? translate(`play:summary.outcome.${player.outcome}`)
      : undefined
  if (out.cause === "life")
    return translate("board:lifeCard.out", {
      reason: translate(`board:lifeCard.outOn.${playSystemRules(model.system).id}`),
    })
  if (out.cause === "counter")
    return translate("board:lifeCard.out", {
      reason: counterOutReason({ id: out.counterId, label: out.counterId }),
    })
  const attacker = model.players[out.from]
  return translate("board:lifeCard.out", {
    reason: attacker
      ? translate("board:lifeCard.outFrom", { total: out.total, name: attacker.name })
      : translate("board:outReason.commanderDamage"),
  })
}

export function recapHeadline(model: GameSummaryModel) {
  const winners = model.players.filter(({ outcome }) => outcome === "win")
  if (winners.length > 0)
    return translate("play:summary.recap.won", {
      names: formatConjunction(winners.map(({ name }) => name)),
    })
  if (model.players.some(({ outcome }) => outcome === "draw"))
    return translate("play:summary.outcome.draw")
  return translate(model.status === "finished" ? "play:summary.finished" : "play:summary.abandoned")
}
