import { flooredLifeDelta, formatDefinition } from "./systems"

export const MAX_LIFE_DELTA = 999_999
export const MAX_SNAPSHOT_LIFE = 1_000_000
export const MAX_COMMANDER_DAMAGE = 99
export const COMMANDER_LETHAL_DAMAGE = 21

export const isLifeDelta = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value !== 0 &&
  Math.abs(value) <= MAX_LIFE_DELTA

export const isCommanderDamageDelta = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value !== 0 &&
  Math.abs(value) <= MAX_COMMANDER_DAMAGE

export interface SeatOwner {
  userId?: string
  deviceId?: string
}

export interface SeatActor {
  userId: string
  deviceId: string
  isHost: boolean
}

export const controlsSeat = (seat: SeatOwner, actor: SeatActor) =>
  (seat.userId === undefined ? actor.isHost : seat.userId === actor.userId) &&
  (seat.deviceId === undefined || seat.deviceId === actor.deviceId)

export interface LifeChangeRequest {
  playerId: string
  actorUserId: string
  delta: number
  deviceId: string
  clientCreatedAt: number
}

export const isSameLifeChange = (
  recorded: Partial<LifeChangeRequest>,
  request: LifeChangeRequest,
) =>
  recorded.playerId === request.playerId &&
  recorded.actorUserId === request.actorUserId &&
  recorded.delta === request.delta &&
  recorded.deviceId === request.deviceId &&
  recorded.clientCreatedAt === request.clientCreatedAt

export function applyLifeChange(system: unknown, currentLife: number, requestedDelta: number) {
  const delta = flooredLifeDelta(system, currentLife, requestedDelta)
  return { delta, currentLife: currentLife + delta }
}

export const MAX_PENDING_COMMANDER_CLAIMS = 100

export const isCommanderFormat = (system: unknown, format: unknown) =>
  formatDefinition(system, format)?.hasCommanderDamage === true

export const isCommanderLethal = (total: number) => total >= COMMANDER_LETHAL_DAMAGE

// why: a claim that can never land is declined when it arrives instead of rejected, so every installed outbox sees a success and stops retrying it.
export function commanderClaimOutcome(claim: {
  total: number
  delta: number
  pendingClaims: number
  pairHasPendingClaim: boolean
}): "pending" | "declined" {
  const nextTotal = claim.total + claim.delta
  return nextTotal < 0 ||
    nextTotal > MAX_COMMANDER_DAMAGE ||
    claim.pendingClaims >= MAX_PENDING_COMMANDER_CLAIMS ||
    claim.pairHasPendingClaim
    ? "declined"
    : "pending"
}

export function confirmCommanderClaim(state: { total: number; life: number; delta: number }) {
  const total = state.total + state.delta
  if (total < 0 || total > MAX_COMMANDER_DAMAGE) return null
  return { total, currentLife: state.life - state.delta }
}

export interface CommanderClaimRequest {
  operationId: string
  fromPlayerId: string
  toPlayerId: string
  delta: number
  actorUserId: string
  deviceId: string
  clientCreatedAt: number
}

export const isSameCommanderClaim = (
  recorded: Partial<CommanderClaimRequest>,
  request: CommanderClaimRequest,
) =>
  recorded.operationId === request.operationId &&
  recorded.fromPlayerId === request.fromPlayerId &&
  recorded.toPlayerId === request.toPlayerId &&
  recorded.delta === request.delta &&
  recorded.actorUserId === request.actorUserId &&
  recorded.deviceId === request.deviceId &&
  recorded.clientCreatedAt === request.clientCreatedAt

export interface CommanderResolutionRequest {
  kind: string
  claimOperationId: string
  defenderPlayerId: string
  actorUserId: string
  deviceId: string
  clientCreatedAt: number
}

export const isSameCommanderResolution = (
  recorded: Partial<Omit<CommanderResolutionRequest, "defenderPlayerId">> & {
    playerId?: string
    toPlayerId?: string
  },
  request: CommanderResolutionRequest,
) =>
  recorded.kind === request.kind &&
  recorded.claimOperationId === request.claimOperationId &&
  recorded.playerId === request.defenderPlayerId &&
  recorded.toPlayerId === request.defenderPlayerId &&
  recorded.actorUserId === request.actorUserId &&
  recorded.deviceId === request.deviceId &&
  recorded.clientCreatedAt === request.clientCreatedAt
