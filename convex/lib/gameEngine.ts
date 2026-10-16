import {
  applyLifeChange,
  commanderClaimOutcome,
  confirmCommanderClaim,
  controlsSeat,
  isCommanderDamageDelta,
  isCommanderFormat,
  isLifeDelta,
  isSameCommanderClaim,
  isSameCommanderResolution,
  isSameLifeChange,
  type CommanderClaimRequest,
  type LifeChangeRequest,
  type SeatActor,
  type SeatOwner,
} from "./gameRules"
import type { GameWriteErrorCode } from "./gameWriteErrors"
import { nameFailsGate } from "./nameFilter"
import { tableRules } from "./systems"
import {
  applyTableAction,
  tableActionDelta,
  type PlayerTable,
  type PokemonCard,
  type TableAction,
  type TableState,
} from "./table"

export interface EngineError {
  readonly code?: GameWriteErrorCode
  readonly message: string
}

export const isEngineError = (value: unknown): value is EngineError =>
  typeof value === "object" && value !== null && "message" in value

const writeError = (code: GameWriteErrorCode, message: string): EngineError => ({ code, message })

const MISMATCH = writeError(
  "sync_operation_mismatch",
  "Operation identifier was reused with different data",
)

export interface EngineGame {
  status: string
  system: unknown
  format: string | undefined
  designations: TableState["designations"]
}

export interface EngineSeat extends SeatOwner, PlayerTable {
  id: string
  currentLife: number
  eventCount?: number
}

export interface GameEventRecord {
  playerId: string
  operationId: string
  kind: string
  delta?: number
  fromPlayerId?: string
  toPlayerId?: string
  claimOperationId?: string
  actorUserId?: string
  deviceId?: string
  clientCreatedAt: number
  serverCreatedAt: number
  undoOfOperationId?: string
  actionIdentity?: string
}

export type ClaimStatus = "pending" | "confirmed" | "declined"

export interface CommanderClaimRecord {
  operationId: string
  resolutionOperationId?: string
  fromPlayerId: string
  toPlayerId: string
  delta: number
  status: ClaimStatus
  actorUserId?: string
  deviceId?: string
  clientCreatedAt: number
  createdAt: number
  resolvedAt?: number
  resolvedByUserId?: string
}

export interface SeatPatch {
  currentLife?: number
  eventCount?: number
  lastEventAt?: number
  counters?: PlayerTable["counters"]
  pokemon?: PlayerTable["pokemon"]
}

export type GameChange =
  | { kind: "seat.patch"; seatId: string; patch: SeatPatch }
  | { kind: "event.insert"; event: GameEventRecord }
  | { kind: "event.rekey"; operationId: string; to: string }
  | { kind: "claim.insert"; claim: CommanderClaimRecord }
  | {
      kind: "claim.patch"
      operationId: string
      patch: Partial<
        Pick<
          CommanderClaimRecord,
          "status" | "resolutionOperationId" | "resolvedAt" | "resolvedByUserId"
        >
      >
    }
  | { kind: "pair.put"; fromPlayerId: string; toPlayerId: string; total: number; updatedAt: number }
  | { kind: "designations.set"; designations: TableState["designations"] }

export type RetryMatch = "new" | "duplicate" | EngineError

export interface WriteRequest {
  operationId: string
  deviceId: string
  clientCreatedAt: number
}

const isValidOperationId = (operationId: string) => /^[A-Za-z0-9_-]{16,128}$/.test(operationId)

export const checkOperationId = (operationId: string) =>
  isValidOperationId(operationId)
    ? null
    : writeError("invalid_operation_id", "Invalid operation identifier")

export const checkDeviceId = (deviceId: string) =>
  /^[A-Za-z0-9_-]{8,128}$/.test(deviceId)
    ? null
    : writeError("invalid_device_id", "Invalid device identifier")

export const checkClientCreatedAt = (clientCreatedAt: number) =>
  Number.isSafeInteger(clientCreatedAt) && clientCreatedAt >= 0
    ? null
    : writeError("invalid_client_timestamp", "Invalid client timestamp")

const checkWrite = ({ operationId, deviceId, clientCreatedAt }: WriteRequest) =>
  checkOperationId(operationId) ?? checkDeviceId(deviceId) ?? checkClientCreatedAt(clientCreatedAt)

export const checkActive = (game: Pick<EngineGame, "status">) =>
  game.status === "active" ? null : writeError("game_not_active", "Game is not active")

export const authorizeSeat = (
  seat: EngineSeat | undefined,
  actor: SeatActor,
  message = "Seat-owner permission required",
) => (seat && controlsSeat(seat, actor) ? null : writeError("seat_owner_required", message))

export const validateLifeChange = (request: WriteRequest & { delta: number }) =>
  (isLifeDelta(request.delta)
    ? null
    : writeError(
        "invalid_life_delta",
        "Life delta must be a non-zero whole number from -999999 to 999999",
      )) ?? checkWrite(request)

export function matchLifeRetry(
  previous: GameEventRecord | undefined,
  request: LifeChangeRequest,
): RetryMatch {
  if (!previous) return "new"
  const delta =
    previous.actionIdentity === undefined ? previous.delta : Number(previous.actionIdentity)
  return previous.kind === "life.changed" && isSameLifeChange({ ...previous, delta }, request)
    ? "duplicate"
    : MISMATCH
}

export function changeLife(
  game: Pick<EngineGame, "system">,
  seat: EngineSeat,
  request: LifeChangeRequest & { operationId: string },
  now: number,
) {
  const { delta, currentLife } = applyLifeChange(game.system, seat.currentLife, request.delta)
  const changes: GameChange[] = [
    {
      kind: "event.insert",
      event: {
        playerId: seat.id,
        operationId: request.operationId,
        kind: "life.changed",
        ...(delta === 0 ? {} : { delta }),
        ...(delta === request.delta ? {} : { actionIdentity: String(request.delta) }),
        actorUserId: request.actorUserId,
        deviceId: request.deviceId,
        clientCreatedAt: request.clientCreatedAt,
        serverCreatedAt: now,
      },
    },
    {
      kind: "seat.patch",
      seatId: seat.id,
      patch: { currentLife, eventCount: (seat.eventCount ?? 0) + 1, lastEventAt: now },
    },
  ]
  return { currentLife, changes }
}

export const validateTableAction = checkWrite

function gatedCard<Card extends PokemonCard>(card: Card): Card {
  return card.name !== undefined && nameFailsGate(card.name) ? { ...card, name: undefined } : card
}

export function gatedTableAction(action: TableAction): TableAction {
  if (action.kind !== "pokemon.placed" && action.kind !== "pokemon.updated") return action
  return { ...action, card: gatedCard(action.card) }
}

export function gatedTableState(table: TableState): TableState {
  return {
    ...table,
    players: Object.fromEntries(
      Object.entries(table.players).map(([playerId, player]) => {
        const board = player.pokemon
        if (!board) return [playerId, player]
        const knockout = board.lastKnockout
        return [
          playerId,
          {
            ...player,
            pokemon: {
              ...(board.active ? { active: gatedCard(board.active) } : {}),
              bench: board.bench.map(gatedCard),
              ...(knockout
                ? { lastKnockout: { ...knockout, pokemon: gatedCard(knockout.pokemon) } }
                : {}),
            },
          },
        ]
      }),
    ),
  }
}

export function tableRelatedSeatId(action: TableAction, actor: PlayerTable) {
  if (
    action.kind === "pokemon.knockedOut" ||
    action.kind === "pokemon.damaged" ||
    action.kind === "pokemon.checkedUp"
  )
    return action.takerPlayerId
  if (action.kind === "pokemon.knockoutUndone") return actor.pokemon?.lastKnockout?.takerPlayerId
  return undefined
}

export interface TableActionRequest extends WriteRequest {
  actorUserId: string
  action: TableAction
  actionIdentity: string
}

export function matchTableRetry(
  previous: GameEventRecord | undefined,
  seat: EngineSeat,
  request: TableActionRequest,
): RetryMatch {
  if (!previous) return "new"
  return previous.kind === request.action.kind &&
    previous.playerId === seat.id &&
    previous.actionIdentity === request.actionIdentity &&
    previous.actorUserId === request.actorUserId &&
    previous.deviceId === request.deviceId &&
    previous.clientCreatedAt === request.clientCreatedAt
    ? "duplicate"
    : MISMATCH
}

const playerTableOfSeat = (seat: EngineSeat): PlayerTable => ({
  ...(seat.counters ? { counters: seat.counters } : {}),
  ...(seat.pokemon ? { pokemon: seat.pokemon } : {}),
})

export function changeTable(
  game: EngineGame,
  actor: EngineSeat,
  related: EngineSeat | undefined,
  request: TableActionRequest,
  now: number,
): { changes: GameChange[] } | EngineError {
  const { action } = request
  const rows = new Map<string, EngineSeat>([[actor.id, actor]])
  if (related) rows.set(related.id, related)
  const table: TableState = {
    designations: game.designations,
    players: Object.fromEntries([...rows.values()].map((row) => [row.id, playerTableOfSeat(row)])),
  }
  const result = applyTableAction(table, action, {
    rules: tableRules(game.system, game.format),
    operationId: request.operationId,
    lifeOf: (playerId) => rows.get(playerId)?.currentLife,
  })
  if (!result) return writeError("invalid_table_action", "This table change no longer applies")

  const changes: GameChange[] = []
  for (const row of rows.values()) {
    const before = table.players[row.id]
    const after = result.table.players[row.id]
    const lifeDelta = result.life
      .filter((change) => change.playerId === row.id)
      .reduce((total, change) => total + change.delta, 0)
    const isActor = row.id === actor.id
    if (!isActor && after === before && lifeDelta === 0) continue
    changes.push({
      kind: "seat.patch",
      seatId: row.id,
      patch: {
        ...(after === before ? {} : { counters: after?.counters, pokemon: after?.pokemon }),
        ...(lifeDelta === 0 ? {} : { currentLife: row.currentLife + lifeDelta }),
        ...(isActor ? { eventCount: (row.eventCount ?? 0) + 1 } : {}),
        lastEventAt: now,
      },
    })
  }
  if (result.table.designations !== table.designations)
    changes.push({ kind: "designations.set", designations: result.table.designations })

  const lifeChange = result.life[0]
  const actionDelta = tableActionDelta(action)
  changes.push({
    kind: "event.insert",
    event: {
      playerId: actor.id,
      operationId: request.operationId,
      kind: action.kind,
      actionIdentity: request.actionIdentity,
      ...(lifeChange
        ? { toPlayerId: lifeChange.playerId, delta: lifeChange.delta }
        : actionDelta === undefined
          ? {}
          : { delta: actionDelta }),
      ...(action.kind === "pokemon.knockoutUndone"
        ? { undoOfOperationId: action.knockoutOperationId }
        : {}),
      actorUserId: request.actorUserId,
      deviceId: request.deviceId,
      clientCreatedAt: request.clientCreatedAt,
      serverCreatedAt: now,
    },
  })
  return { changes }
}

export const checkCommanderGame = (game: Pick<EngineGame, "system" | "format">) =>
  isCommanderFormat(game.system, game.format)
    ? null
    : { message: "Commander damage is only available in Commander games" }

export const validateCommanderClaim = (
  request: WriteRequest & { delta: number; fromPlayerId: string; toPlayerId: string },
) =>
  (isCommanderDamageDelta(request.delta)
    ? null
    : { message: "Commander damage delta must be a non-zero whole number from -99 to 99" }) ??
  checkWrite(request) ??
  (request.fromPlayerId === request.toPlayerId
    ? { message: "A commander cannot damage itself" }
    : null)

export const checkClaimTarget = (target: EngineSeat | undefined) =>
  target ? null : { message: "Commander damage target must belong to this game" }

export function matchClaimRetry(
  existing: CommanderClaimRecord | undefined,
  eventWithOperation: GameEventRecord | undefined,
  request: CommanderClaimRequest,
): RetryMatch {
  if (existing) return isSameCommanderClaim(existing, request) ? "duplicate" : MISMATCH
  return eventWithOperation ? MISMATCH : "new"
}

export const declinedClaimOperationId = (operationId: string) => `${operationId}_declined`

export function submitClaim(
  state: {
    total: number
    pending: readonly Pick<CommanderClaimRecord, "fromPlayerId" | "toPlayerId">[]
    declinedEventExists: boolean
  },
  target: EngineSeat,
  request: CommanderClaimRequest,
  now: number,
): { status: ClaimStatus; changes: GameChange[] } | EngineError {
  const declined =
    commanderClaimOutcome({
      total: state.total,
      delta: request.delta,
      pendingClaims: state.pending.length,
      pairHasPendingClaim: state.pending.some(
        (claim) => claim.fromPlayerId === request.fromPlayerId && claim.toPlayerId === target.id,
      ),
    }) === "declined"
  if (declined && state.declinedEventExists) return MISMATCH
  const status: ClaimStatus = declined ? "declined" : "pending"
  const event = {
    playerId: target.id,
    delta: request.delta,
    fromPlayerId: request.fromPlayerId,
    toPlayerId: target.id,
    claimOperationId: request.operationId,
    clientCreatedAt: request.clientCreatedAt,
    serverCreatedAt: now,
  }
  const changes: GameChange[] = [
    {
      kind: "claim.insert",
      claim: {
        operationId: request.operationId,
        fromPlayerId: request.fromPlayerId,
        toPlayerId: target.id,
        delta: request.delta,
        status,
        actorUserId: request.actorUserId,
        deviceId: request.deviceId,
        clientCreatedAt: request.clientCreatedAt,
        createdAt: now,
        ...(declined ? { resolvedAt: now } : {}),
      },
    },
    {
      kind: "event.insert",
      event: {
        ...event,
        operationId: request.operationId,
        kind: "commanderDamage.claimed",
        actorUserId: request.actorUserId,
        deviceId: request.deviceId,
      },
    },
  ]
  if (declined)
    changes.push({
      kind: "event.insert",
      event: {
        ...event,
        operationId: declinedClaimOperationId(request.operationId),
        kind: "commanderDamage.declined",
      },
    })
  changes.push({
    kind: "seat.patch",
    seatId: target.id,
    patch: { eventCount: (target.eventCount ?? 0) + (declined ? 2 : 1), lastEventAt: now },
  })
  return { status, changes }
}

export type ClaimDecision = "confirmed" | "declined"

export interface ResolutionRequest extends WriteRequest {
  actorUserId: string
  resolutionOperationId?: string
}

export const validateResolution = (request: ResolutionRequest) =>
  checkOperationId(request.operationId) ??
  (request.resolutionOperationId === undefined
    ? null
    : checkOperationId(request.resolutionOperationId)) ??
  checkDeviceId(request.deviceId) ??
  checkClientCreatedAt(request.clientCreatedAt)

export function checkResolutionBinding(
  claim: CommanderClaimRecord | undefined,
  request: ResolutionRequest,
): EngineError | null {
  if (!claim) return { message: "Commander damage claim not found" }
  return request.resolutionOperationId &&
    claim.resolutionOperationId &&
    claim.resolutionOperationId !== request.resolutionOperationId
    ? MISMATCH
    : null
}

export const resolutionEventIds = (claim: CommanderClaimRecord) => [
  ...(claim.resolutionOperationId ? [claim.resolutionOperationId] : []),
  `${claim.operationId}_${claim.status}`,
]

export function matchResolutionRetry(
  claim: CommanderClaimRecord,
  decision: ClaimDecision,
  events: {
    withResolutionId: GameEventRecord | undefined
    recorded: GameEventRecord | undefined
  },
  request: ResolutionRequest,
): "new" | { changes: GameChange[] } | EngineError {
  const { resolutionOperationId } = request
  if (
    resolutionOperationId &&
    events.withResolutionId &&
    (events.withResolutionId.claimOperationId !== claim.operationId ||
      events.withResolutionId.kind !== `commanderDamage.${decision}`)
  )
    return MISMATCH
  if (claim.status === "pending") return "new"
  if (!resolutionOperationId) return { changes: [] }
  if (claim.status !== decision) return MISMATCH
  const event = events.recorded
  if (
    !event ||
    !isSameCommanderResolution(event, {
      kind: `commanderDamage.${claim.status}`,
      claimOperationId: claim.operationId,
      defenderPlayerId: claim.toPlayerId,
      actorUserId: request.actorUserId,
      deviceId: request.deviceId,
      clientCreatedAt: request.clientCreatedAt,
    })
  )
    return MISMATCH
  const changes: GameChange[] = []
  if (!claim.resolutionOperationId)
    changes.push({
      kind: "claim.patch",
      operationId: claim.operationId,
      patch: { resolutionOperationId },
    })
  if (event.operationId !== resolutionOperationId)
    changes.push({ kind: "event.rekey", operationId: event.operationId, to: resolutionOperationId })
  return { changes }
}

export function resolveClaim(
  claim: CommanderClaimRecord,
  decision: ClaimDecision,
  pairTotal: number,
  target: EngineSeat,
  request: ResolutionRequest,
  now: number,
): { changes: GameChange[]; total?: number; currentLife?: number } | EngineError {
  const event: GameEventRecord = {
    playerId: target.id,
    operationId: request.resolutionOperationId ?? `${claim.operationId}_${decision}`,
    kind: `commanderDamage.${decision}`,
    delta: claim.delta,
    fromPlayerId: claim.fromPlayerId,
    toPlayerId: claim.toPlayerId,
    claimOperationId: claim.operationId,
    actorUserId: request.actorUserId,
    deviceId: request.deviceId,
    clientCreatedAt: request.clientCreatedAt,
    serverCreatedAt: now,
  }
  const settled: GameChange = {
    kind: "claim.patch",
    operationId: claim.operationId,
    patch: {
      status: decision,
      ...(request.resolutionOperationId
        ? { resolutionOperationId: request.resolutionOperationId }
        : {}),
      resolvedAt: now,
      resolvedByUserId: request.actorUserId,
    },
  }
  const eventCount = (target.eventCount ?? 0) + 1
  if (decision === "declined")
    return {
      changes: [
        { kind: "event.insert", event },
        settled,
        { kind: "seat.patch", seatId: target.id, patch: { eventCount, lastEventAt: now } },
      ],
    }
  const confirmed = confirmCommanderClaim({
    total: pairTotal,
    life: target.currentLife,
    delta: claim.delta,
  })
  if (!confirmed) return { message: "Commander damage total must remain between 0 and 99" }
  const { total, currentLife } = confirmed
  return {
    total,
    currentLife,
    changes: [
      { kind: "event.insert", event },
      {
        kind: "pair.put",
        fromPlayerId: claim.fromPlayerId,
        toPlayerId: claim.toPlayerId,
        total,
        updatedAt: now,
      },
      {
        kind: "seat.patch",
        seatId: target.id,
        patch: { currentLife, eventCount, lastEventAt: now },
      },
      settled,
    ],
  }
}
