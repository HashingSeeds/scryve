import { playSystemId, type PlaySystemId } from "@/features/game/playSystems"
import type {
  ActorId,
  DeviceId,
  GameId,
  LifeChangedEvent,
  OperationId,
  PlayerId,
} from "@/features/game/types"

export type ConnectedGameStatus = "lobby" | "active" | "finished" | "abandoned"
export const CONNECTED_RECENT_OPERATION_LIMIT = 100

export interface ConnectedPlayerProjection {
  playerId: string
  seat: number
  displayName: string
  username?: string
  deckVersionId?: string
  eliminatedByCommanderDamage?: boolean
  color: string
  shape?: string
  currentLife: number
  controlledByMe: boolean
}

export interface ConnectedCommanderDamageTotal {
  fromPlayerId: string
  toPlayerId: string
  total: number
}

export interface ConnectedCommanderDamageClaim {
  claimId: string
  operationId: string
  fromPlayerId: string
  toPlayerId: string
  delta: number
  clientCreatedAt: number
  createdAt: number
}

export interface ConnectedCommanderDamageProjection {
  totals: ConnectedCommanderDamageTotal[]
  pendingClaims: ConnectedCommanderDamageClaim[]
  eliminatedPlayerIds: string[]
}

/** A single assignment submitted by the attacker's device. */
export interface ConnectedCommanderDamageChange {
  toPlayerId: string
  delta: number
}

export interface CommanderDamageSubmittedEvent {
  type: "commanderDamage.submitted"
  operationId: OperationId
  gameId: GameId
  fromPlayerId: PlayerId
  toPlayerId: PlayerId
  delta: number
  actorId: ActorId
  deviceId: DeviceId
  clientCreatedAt: number
}

/**
 * The defender's decision on a claim. It travels through the same durable outbox
 * as every other write, so a confirmation made offline replays on reconnect.
 */
export interface CommanderDamageResolvedEvent {
  type: "commanderDamage.resolved"
  operationId: OperationId
  claimOperationId: OperationId
  gameId: GameId
  toPlayerId: PlayerId
  accepted: boolean
  actorId: ActorId
  deviceId: DeviceId
  clientCreatedAt: number
}

export interface ConnectedProjection {
  schemaVersion: 1
  publicId: string
  status: ConnectedGameStatus
  playerCount: number
  system?: PlaySystemId
  format?: string
  startingLife: number
  ruleset: string
  isHost: boolean
  eventSequence: number
  serverUpdatedAt: number
  recentOperationIds: string[]
  /** Optional so projections from before commander damage remain readable. */
  commanderDamage?: ConnectedCommanderDamageProjection
  players: ConnectedPlayerProjection[]
}

export type ConnectedActionEvent =
  LifeChangedEvent | CommanderDamageSubmittedEvent | CommanderDamageResolvedEvent

export interface PendingConnectedAction {
  schemaVersion: 1
  event: ConnectedActionEvent
  queuedAt: number
  attempts: number
  lastAttemptAt?: number
}

export interface FailedConnectedAction {
  schemaVersion: 1
  action: PendingConnectedAction
  reason: string
  failedAt: number
}

export type PendingLifeAction = PendingConnectedAction
export type FailedLifeAction = FailedConnectedAction

export interface ConnectedDisplayProjection extends ConnectedProjection {
  players: Array<ConnectedPlayerProjection & { pendingDelta: number }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function toConnectedProjection(value: unknown): ConnectedProjection | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.publicId !== "string" ||
    typeof value.status !== "string" ||
    !(["lobby", "active", "finished", "abandoned"] as const).includes(
      value.status as ConnectedGameStatus,
    ) ||
    typeof value.playerCount !== "number" ||
    !Number.isInteger(value.playerCount) ||
    typeof value.startingLife !== "number" ||
    !Number.isInteger(value.startingLife) ||
    typeof value.ruleset !== "string" ||
    typeof value.isHost !== "boolean" ||
    typeof value.eventSequence !== "number" ||
    !Number.isInteger(value.eventSequence) ||
    typeof value.serverUpdatedAt !== "number" ||
    !Array.isArray(value.recentOperationIds) ||
    !Array.isArray(value.players)
  )
    return null
  const players: ConnectedPlayerProjection[] = []
  for (const player of value.players) {
    if (
      !isRecord(player) ||
      typeof player.playerId !== "string" ||
      typeof player.seat !== "number" ||
      !Number.isInteger(player.seat) ||
      typeof player.displayName !== "string" ||
      typeof player.color !== "string" ||
      typeof player.currentLife !== "number" ||
      !Number.isFinite(player.currentLife) ||
      typeof player.controlledByMe !== "boolean"
    )
      return null
    players.push({
      playerId: player.playerId,
      seat: player.seat,
      displayName: player.displayName,
      ...(typeof player.username === "string" ? { username: player.username } : {}),
      ...(typeof player.deckVersionId === "string" ? { deckVersionId: player.deckVersionId } : {}),
      ...(typeof player.eliminatedByCommanderDamage === "boolean"
        ? { eliminatedByCommanderDamage: player.eliminatedByCommanderDamage }
        : {}),
      color: player.color,
      ...(typeof player.shape === "string" ? { shape: player.shape } : {}),
      currentLife: player.currentLife,
      controlledByMe: player.controlledByMe,
    })
  }
  const commanderDamageValue = value.commanderDamage
  let commanderDamage: ConnectedCommanderDamageProjection | undefined
  if (commanderDamageValue !== undefined) {
    if (!isRecord(commanderDamageValue)) return null
    const totals: ConnectedCommanderDamageTotal[] = []
    for (const total of Array.isArray(commanderDamageValue.totals)
      ? commanderDamageValue.totals
      : []) {
      const totalValue = isRecord(total) ? total.total : undefined
      if (
        !isRecord(total) ||
        typeof total.fromPlayerId !== "string" ||
        typeof total.toPlayerId !== "string" ||
        typeof totalValue !== "number" ||
        !Number.isInteger(totalValue) ||
        totalValue < 0
      )
        return null
      totals.push({
        fromPlayerId: total.fromPlayerId,
        toPlayerId: total.toPlayerId,
        total: totalValue,
      })
    }
    const pendingClaims: ConnectedCommanderDamageClaim[] = []
    for (const claim of Array.isArray(commanderDamageValue.pendingClaims)
      ? commanderDamageValue.pendingClaims
      : []) {
      const delta = isRecord(claim) ? claim.delta : undefined
      if (
        !isRecord(claim) ||
        typeof claim.claimId !== "string" ||
        typeof claim.operationId !== "string" ||
        typeof claim.fromPlayerId !== "string" ||
        typeof claim.toPlayerId !== "string" ||
        typeof delta !== "number" ||
        !Number.isInteger(delta) ||
        typeof claim.clientCreatedAt !== "number" ||
        !Number.isFinite(claim.clientCreatedAt) ||
        typeof claim.createdAt !== "number" ||
        !Number.isFinite(claim.createdAt)
      )
        return null
      pendingClaims.push({
        claimId: claim.claimId,
        operationId: claim.operationId,
        fromPlayerId: claim.fromPlayerId,
        toPlayerId: claim.toPlayerId,
        delta,
        clientCreatedAt: claim.clientCreatedAt,
        createdAt: claim.createdAt,
      })
    }
    if (
      !Array.isArray(commanderDamageValue.eliminatedPlayerIds) ||
      commanderDamageValue.eliminatedPlayerIds.some((id) => typeof id !== "string")
    )
      return null
    commanderDamage = {
      totals,
      pendingClaims,
      eliminatedPlayerIds: commanderDamageValue.eliminatedPlayerIds,
    }
  }
  return {
    schemaVersion: 1,
    publicId: value.publicId,
    status: value.status as ConnectedGameStatus,
    playerCount: value.playerCount,
    system: playSystemId(value.system),
    format: typeof value.format === "string" && value.format ? value.format : value.ruleset,
    startingLife: value.startingLife,
    ruleset: value.ruleset,
    isHost: value.isHost,
    eventSequence: value.eventSequence,
    serverUpdatedAt: value.serverUpdatedAt,
    recentOperationIds: value.recentOperationIds
      .filter((operationId: unknown): operationId is string => typeof operationId === "string")
      .slice(0, CONNECTED_RECENT_OPERATION_LIMIT),
    ...(commanderDamage ? { commanderDamage } : {}),
    players,
  }
}
