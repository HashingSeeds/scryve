import {
  authorizeSeat,
  changeLife,
  changeTable,
  checkActive,
  checkClaimTarget,
  checkCommanderGame,
  checkResolutionBinding,
  declinedClaimOperationId,
  gatedTableAction,
  isEngineError,
  matchClaimRetry,
  matchLifeRetry,
  matchResolutionRetry,
  matchTableRetry,
  resolutionEventIds,
  resolveClaim,
  submitClaim,
  tableRelatedSeatId,
  validateCommanderClaim,
  validateLifeChange,
  validateResolution,
  validateTableAction,
  type ClaimDecision,
  type CommanderClaimRecord,
  type EngineError,
  type EngineGame,
  type EngineSeat,
  type GameChange,
  type GameEventRecord,
  type WriteRequest,
} from "./gameEngine"
import type { SeatActor } from "./gameRules"
import { tableActionIdentity, type TableAction } from "./table"

export interface MemoryGame extends EngineGame {
  seats: Map<string, EngineSeat & { lastEventAt?: number }>
  events: Map<string, GameEventRecord>
  claims: Map<string, CommanderClaimRecord>
  pairs: Map<string, { total: number; updatedAt: number }>
}

export type MemoryWrite =
  | (WriteRequest & { kind: "life"; playerId: string; delta: number })
  | (WriteRequest & { kind: "table"; action: TableAction })
  | (WriteRequest & {
      kind: "commander.claim"
      fromPlayerId: string
      toPlayerId: string
      delta: number
    })
  | (WriteRequest & {
      kind: "commander.resolve"
      decision: ClaimDecision
      resolutionOperationId?: string
    })

export type MemoryWriteResult =
  { ok: true; deduplicated: boolean } | { ok: false; error: EngineError }

const pairKey = (fromPlayerId: string, toPlayerId: string) => `${fromPlayerId}\u0000${toPlayerId}`

export function applyGameChanges(game: MemoryGame, changes: readonly GameChange[]) {
  for (const change of changes) {
    if (change.kind === "seat.patch") {
      const seat = game.seats.get(change.seatId)
      if (seat) game.seats.set(change.seatId, { ...seat, ...change.patch })
    } else if (change.kind === "event.insert")
      game.events.set(change.event.operationId, change.event)
    else if (change.kind === "event.rekey") {
      const event = game.events.get(change.operationId)
      if (!event) continue
      game.events.delete(change.operationId)
      game.events.set(change.to, { ...event, operationId: change.to })
    } else if (change.kind === "claim.insert")
      game.claims.set(change.claim.operationId, change.claim)
    else if (change.kind === "claim.patch") {
      const claim = game.claims.get(change.operationId)
      if (claim) game.claims.set(change.operationId, { ...claim, ...change.patch })
    } else if (change.kind === "pair.put")
      game.pairs.set(pairKey(change.fromPlayerId, change.toPlayerId), {
        total: change.total,
        updatedAt: change.updatedAt,
      })
    else game.designations = change.designations
  }
}

const failed = (error: EngineError): MemoryWriteResult => ({ ok: false, error })

function commit(
  game: MemoryGame,
  outcome: { changes: GameChange[] } | EngineError,
): MemoryWriteResult {
  if (isEngineError(outcome)) return failed(outcome)
  applyGameChanges(game, outcome.changes)
  return { ok: true, deduplicated: false }
}

export function writeMemoryGame(
  game: MemoryGame,
  identity: Omit<SeatActor, "deviceId">,
  write: MemoryWrite,
  now: number,
): MemoryWriteResult {
  const actor: SeatActor = { ...identity, deviceId: write.deviceId }
  const actorUserId = actor.userId
  if (write.kind === "life") {
    const request = { ...write, actorUserId }
    const seat = game.seats.get(write.playerId)
    const invalid = validateLifeChange(write) ?? authorizeSeat(seat, actor)
    if (invalid || !seat) return failed(invalid ?? { message: "Seat not found" })
    const retry = matchLifeRetry(game.events.get(write.operationId), {
      ...request,
      playerId: seat.id,
    })
    if (retry === "duplicate") return { ok: true, deduplicated: true }
    if (retry !== "new") return failed(retry)
    const inactive = checkActive(game)
    if (inactive) return failed(inactive)
    return commit(game, changeLife(game, seat, { ...request, playerId: seat.id }, now))
  }

  if (write.kind === "table") {
    const invalidRequest = validateTableAction(write)
    if (invalidRequest) return failed(invalidRequest)
    const action = gatedTableAction(write.action)
    const seat = game.seats.get(action.playerId)
    const unauthorized = authorizeSeat(seat, actor)
    if (unauthorized || !seat) return failed(unauthorized ?? { message: "Seat not found" })
    const request = {
      ...write,
      action,
      actorUserId,
      actionIdentity: tableActionIdentity(write.action),
    }
    const retry = matchTableRetry(game.events.get(write.operationId), seat, request)
    if (retry === "duplicate") return { ok: true, deduplicated: true }
    if (retry !== "new") return failed(retry)
    const inactive = checkActive(game)
    if (inactive) return failed(inactive)
    const related = game.seats.get(tableRelatedSeatId(action, seat) ?? "")
    return commit(game, changeTable(game, seat, related, request, now))
  }

  if (write.kind === "commander.claim") {
    const request = { ...write, actorUserId }
    const source = game.seats.get(write.fromPlayerId)
    const target = game.seats.get(write.toPlayerId)
    const invalid =
      validateCommanderClaim(write) ??
      checkCommanderGame(game) ??
      checkActive(game) ??
      authorizeSeat(source, actor, "Seat-owner permission required for the attacking seat") ??
      checkClaimTarget(target)
    if (invalid || !target) return failed(invalid ?? { message: "Seat not found" })
    const retry = matchClaimRetry(
      game.claims.get(write.operationId),
      game.events.get(write.operationId),
      request,
    )
    if (retry === "duplicate") return { ok: true, deduplicated: true }
    if (retry !== "new") return failed(retry)
    const pending = [...game.claims.values()].filter((claim) => claim.status === "pending")
    return commit(
      game,
      submitClaim(
        {
          total: game.pairs.get(pairKey(write.fromPlayerId, target.id))?.total ?? 0,
          pending,
          declinedEventExists: game.events.has(declinedClaimOperationId(write.operationId)),
        },
        target,
        request,
        now,
      ),
    )
  }

  const request = { ...write, actorUserId }
  const claim = game.claims.get(write.operationId)
  const invalid =
    validateResolution(request) ??
    checkCommanderGame(game) ??
    checkResolutionBinding(claim, request)
  if (invalid || !claim) return failed(invalid ?? { message: "Commander damage claim not found" })
  const target = game.seats.get(claim.toPlayerId)
  const unauthorized = authorizeSeat(
    target,
    actor,
    "Seat-owner permission required for the defending seat",
  )
  if (unauthorized || !target) return failed(unauthorized ?? { message: "Seat not found" })
  const recordedId = resolutionEventIds(claim).find((operationId) => game.events.has(operationId))
  const retry = matchResolutionRetry(
    claim,
    write.decision,
    {
      withResolutionId: write.resolutionOperationId
        ? game.events.get(write.resolutionOperationId)
        : undefined,
      recorded: recordedId === undefined ? undefined : game.events.get(recordedId),
    },
    request,
  )
  if (isEngineError(retry)) return failed(retry)
  if (retry !== "new") {
    applyGameChanges(game, retry.changes)
    return { ok: true, deduplicated: true }
  }
  const inactive = checkActive(game)
  if (inactive) return failed(inactive)
  return commit(
    game,
    resolveClaim(
      claim,
      write.decision,
      game.pairs.get(pairKey(claim.fromPlayerId, claim.toPlayerId))?.total ?? 0,
      target,
      request,
      now,
    ),
  )
}
