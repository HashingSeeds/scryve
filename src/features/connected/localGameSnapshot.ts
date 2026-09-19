import { NO_PLAY_SYSTEM, supportsCommanderDamage } from "@/features/game/playSystems"
import type { LocalGame, PlayerId } from "@/features/game/types"

/**
 * The `publishLocalGame` payload, built entirely from local state.
 *
 * Seats are the awkward part: a local game numbers seats from zero (they come
 * from the player array index) while the server requires 1..playerCount, so every
 * seat crosses this boundary rebased.
 */
export interface LocalGameSnapshot {
  operationId: string
  publicId: string
  system?: string
  format?: string
  ruleset: string
  startingLife: number
  lifeStep?: number
  inviteToken: string
  manualCodeCandidates: string[]
  deviceId?: string
  hostLocalId: string
  players: {
    localId: string
    seat: number
    displayName: string
    color: string
    shape?: string
    currentLife: number
  }[]
  commanderTotals?: { fromSeat: number; toSeat: number; total: number }[]
}

export interface LocalGameSnapshotInput {
  game: LocalGame
  /** Which seat belongs to the publishing account. */
  hostPlayerId: PlayerId
  operationId: string
  publicId: string
  inviteToken: string
  manualCodeCandidates: string[]
  deviceId?: string
}

/** Commander totals are only accepted for Commander games, matching the server. */
function commanderTotalsFor(game: LocalGame, seatsByPlayerId: Map<PlayerId, number>) {
  if (!game.commanderDamage || !supportsCommanderDamage(game.system, game.format)) return undefined
  const totals: { fromSeat: number; toSeat: number; total: number }[] = []
  for (const [key, total] of Object.entries(game.commanderDamage)) {
    if (total <= 0) continue
    const [fromPlayerId, toPlayerId] = key.split(">") as [PlayerId, PlayerId]
    const fromSeat = seatsByPlayerId.get(fromPlayerId)
    const toSeat = seatsByPlayerId.get(toPlayerId)
    if (fromSeat === undefined || toSeat === undefined || fromSeat === toSeat) continue
    totals.push({ fromSeat, toSeat, total })
  }
  return totals.length > 0 ? totals : undefined
}

/**
 * Maps a running local game onto the publish mutation's arguments.
 *
 * `operationId` must stay stable across retries of one publish attempt: the
 * server's receipt rejects a reused id whose payload differs.
 */
export function buildLocalGameSnapshot({
  game,
  hostPlayerId,
  operationId,
  publicId,
  inviteToken,
  manualCodeCandidates,
  deviceId,
}: LocalGameSnapshotInput): LocalGameSnapshot {
  const ordered = [...game.players].sort((left, right) => left.seat - right.seat)
  if (!ordered.some((player) => player.id === hostPlayerId))
    throw new Error("The host seat must be one of this game's players")
  const seatsByPlayerId = new Map<PlayerId, number>(
    ordered.map((player, index) => [player.id, index + 1]),
  )
  const commanderTotals = commanderTotalsFor(game, seatsByPlayerId)
  return {
    operationId,
    publicId,
    inviteToken,
    manualCodeCandidates,
    ruleset: game.format ?? NO_PLAY_SYSTEM,
    startingLife: game.startingLife,
    hostLocalId: hostPlayerId,
    ...(game.system ? { system: game.system } : {}),
    ...(game.format ? { format: game.format } : {}),
    ...(game.lifeStep === undefined ? {} : { lifeStep: game.lifeStep }),
    ...(deviceId ? { deviceId } : {}),
    players: ordered.map((player, index) => ({
      localId: player.id,
      seat: index + 1,
      displayName: player.name,
      color: player.color,
      ...(player.shape ? { shape: player.shape } : {}),
      currentLife: player.life,
    })),
    ...(commanderTotals ? { commanderTotals } : {}),
  }
}
