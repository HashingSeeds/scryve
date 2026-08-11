import type { LifeChangedEvent } from "@/features/game/types"

export type ConnectedGameStatus = "lobby" | "active" | "finished" | "abandoned"
export const CONNECTED_RECENT_OPERATION_LIMIT = 100

export interface ConnectedPlayerProjection {
  playerId: string
  seat: number
  displayName: string
  username?: string
  deckVersionId?: string
  avatarUrl?: string
  color: string
  currentLife: number
  controlledByMe: boolean
}

export interface ConnectedProjection {
  schemaVersion: 1
  publicId: string
  status: ConnectedGameStatus
  playerCount: number
  startingLife: number
  ruleset: string
  isHost: boolean
  eventSequence: number
  serverUpdatedAt: number
  recentOperationIds: string[]
  players: ConnectedPlayerProjection[]
}

export interface PendingLifeAction {
  schemaVersion: 1
  event: LifeChangedEvent
  queuedAt: number
  attempts: number
  lastAttemptAt?: number
}

export interface FailedLifeAction {
  schemaVersion: 1
  action: PendingLifeAction
  reason: string
  failedAt: number
}

export interface ConnectedDisplayProjection extends ConnectedProjection {
  players: Array<ConnectedPlayerProjection & { pendingDelta: number }>
}

export function toConnectedProjection(value: any): ConnectedProjection | null {
  if (
    !value ||
    typeof value !== "object" ||
    value.schemaVersion !== 1 ||
    typeof value.publicId !== "string" ||
    !["lobby", "active", "finished", "abandoned"].includes(value.status) ||
    !Number.isInteger(value.playerCount) ||
    !Number.isInteger(value.startingLife) ||
    typeof value.ruleset !== "string" ||
    typeof value.isHost !== "boolean" ||
    !Number.isInteger(value.eventSequence) ||
    typeof value.serverUpdatedAt !== "number" ||
    !Array.isArray(value.recentOperationIds) ||
    !Array.isArray(value.players)
  )
    return null
  const players: ConnectedPlayerProjection[] = []
  for (const player of value.players) {
    if (
      !player ||
      typeof player.playerId !== "string" ||
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
      ...(typeof player.avatarUrl === "string" ? { avatarUrl: player.avatarUrl } : {}),
      color: player.color,
      currentLife: player.currentLife,
      controlledByMe: player.controlledByMe,
    })
  }
  return {
    schemaVersion: 1,
    publicId: value.publicId,
    status: value.status,
    playerCount: value.playerCount,
    startingLife: value.startingLife,
    ruleset: value.ruleset,
    isHost: value.isHost,
    eventSequence: value.eventSequence,
    serverUpdatedAt: value.serverUpdatedAt,
    recentOperationIds: value.recentOperationIds
      .filter((operationId: unknown): operationId is string => typeof operationId === "string")
      .slice(0, CONNECTED_RECENT_OPERATION_LIMIT),
    players,
  }
}
