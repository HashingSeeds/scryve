import { flooredLifeDelta } from "./systems"

export const MAX_LIFE_DELTA = 999_999
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

// why: one predicate for every seat write; copies of it drifted is how a seat ends up writable by the wrong device.
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

// why: a retry must repeat its request exactly; accepting a near match would apply someone else's change under a reused id.
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
