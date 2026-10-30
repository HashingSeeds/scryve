import { DEFAULT_DECK_GAME } from "./deckGames"
import {
  applyLifeChange,
  commanderClaimOutcome,
  commanderField,
  confirmCommanderClaim,
  controlsSeat,
  isCommanderDamageDelta,
  isCommanderFormat,
  isCommanderSlot,
  isLifeDelta,
  isSameCommanderClaim,
  isSameCommanderResolution,
  isSameLifeChange,
  PARTNER_COMMANDER,
  type CommanderClaimRequest,
  type CommanderSlot,
  type LifeChangeRequest,
  type SeatActor,
  type SeatOwner,
} from "./gameRules"
import type { GameWriteErrorCode } from "./gameWriteErrors"
import { nameFailsGate } from "./nameFilter"
import { tableRules } from "./systems"
import {
  applyTableAction,
  seatTable,
  tableActionDelta,
  tableActionIdentity,
  tableRelatedSeatId,
  type PlayerTable,
  type PokemonCard,
  type TableAction,
  type TableState,
} from "./table"
import type { Doc } from "../_generated/dataModel"

export interface EngineError {
  readonly kind: "rejected"
  readonly code?: GameWriteErrorCode
  readonly message: string
}

export const isEngineError = (value: unknown): value is EngineError =>
  typeof value === "object" && value !== null && "kind" in value && value.kind === "rejected"

export const rejected = (message: string): EngineError => ({ kind: "rejected", message })

const writeError = (code: GameWriteErrorCode, message: string): EngineError => ({
  kind: "rejected",
  code,
  message,
})

const MISMATCH = writeError(
  "sync_operation_mismatch",
  "Operation identifier was reused with different data",
)

export const engineGameOf = (
  game: Pick<Doc<"games">, "status" | "system" | "game" | "format" | "ruleset" | "designations">,
): EngineGame => ({
  status: game.status,
  system: game.system ?? game.game ?? DEFAULT_DECK_GAME,
  format: game.format ?? game.ruleset,
  designations: game.designations ?? {},
})

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

export interface CommanderPair {
  fromPlayerId: string
  toPlayerId: string
  commander?: CommanderSlot
}

export interface GameEventRecord {
  playerId: string
  operationId: string
  kind: string
  delta?: number
  fromPlayerId?: string
  toPlayerId?: string
  commander?: CommanderSlot
  claimOperationId?: string
  actorUserId?: string
  deviceId?: string
  clientCreatedAt: number
  serverCreatedAt: number
  undoOfOperationId?: string
  actionIdentity?: string
}

export type ClaimStatus = "pending" | "confirmed" | "declined"

export interface CommanderClaimRecord extends CommanderPair {
  operationId: string
  resolutionOperationId?: string
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
  | (CommanderPair & { kind: "pair.put"; total: number; updatedAt: number })
  | { kind: "designations.set"; designations: TableState["designations"] }

export interface WriteRequest {
  operationId: string
  deviceId: string
  clientCreatedAt: number
}

export type ClaimDecision = "confirmed" | "declined"

export type GameWrite =
  | (WriteRequest & { kind: "life"; playerId: string; delta: number })
  | (WriteRequest & { kind: "table"; action: TableAction })
  | (WriteRequest & {
      kind: "commander.claim"
      fromPlayerId: string
      toPlayerId: string
      commander?: number
      delta: number
    })
  | (WriteRequest & {
      kind: "commander.resolve"
      decision: ClaimDecision
      resolutionOperationId?: string
    })

type WriteOf<Kind extends GameWrite["kind"]> = Extract<GameWrite, { kind: Kind }>

export interface GameAck {
  operationId: string
  deduplicated: boolean
  status?: ClaimStatus
  currentLife?: number
  total?: number
}

export type GameWriteResult = { ok: true; ack: GameAck } | { ok: false; error: EngineError }

export type Read<T> = T | Promise<T>

/**
 * why: reads only see this game, and `pendingClaims` may stop after
 * MAX_PENDING_COMMANDER_CLAIMS + 1. `beforeNewWrite` runs once a write is known not to be a
 * retry, so a retry never spends the rate limit.
 */
export interface GameStore {
  readonly game: EngineGame
  seat(id: string): Read<EngineSeat | undefined>
  event(operationId: string): Read<GameEventRecord | undefined>
  claim(operationId: string): Read<CommanderClaimRecord | undefined>
  pendingClaims(): Read<readonly CommanderPair[]>
  pairTotal(pair: CommanderPair): Read<number>
  beforeNewWrite?(): Read<void>
  apply(changes: readonly GameChange[]): Read<void>
}

export type GameSteps<Result> = Generator<Read<unknown>, Result, never>

function* read<T>(answer: Read<T>): Generator<Read<T>, T, T> {
  return yield answer
}

export function runSync<Result>(steps: GameSteps<Result>): Result {
  let step = steps.next()
  // why: each answer goes back to the read that yielded it, a pairing TypeScript can't follow.
  while (!step.done) {
    if (step.value instanceof Promise)
      throw new Error("A synchronous game store returned a promise")
    step = steps.next(step.value as never)
  }
  return step.value
}

export async function runAsync<Result>(steps: GameSteps<Result>): Promise<Result> {
  let step = steps.next()
  while (!step.done) step = steps.next((await step.value) as never)
  return step.value
}

export type RetryMatch = "new" | "duplicate" | EngineError

export const checkOperationId = (operationId: string) =>
  /^[A-Za-z0-9_-]{16,128}$/.test(operationId)
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

const checkActive = (game: Pick<EngineGame, "status">) =>
  game.status === "active" ? null : writeError("game_not_active", "Game is not active")

export function rejectRequest(write: GameWrite): EngineError | null {
  if (write.kind === "life")
    return (
      (isLifeDelta(write.delta)
        ? null
        : writeError(
            "invalid_life_delta",
            "Life delta must be a non-zero whole number from -999999 to 999999",
          )) ?? checkWrite(write)
    )
  if (write.kind === "table") return checkWrite(write)
  if (write.kind === "commander.claim")
    return (
      (isCommanderDamageDelta(write.delta)
        ? null
        : rejected("Commander damage delta must be a non-zero whole number from -99 to 99")) ??
      (isCommanderSlot(write.commander)
        ? null
        : rejected("Commander must be omitted for the first commander or 1 for the partner")) ??
      checkWrite(write) ??
      (write.fromPlayerId === write.toPlayerId
        ? rejected("A commander cannot damage itself")
        : null)
    )
  return (
    checkOperationId(write.operationId) ??
    (write.resolutionOperationId === undefined
      ? null
      : checkOperationId(write.resolutionOperationId)) ??
    checkDeviceId(write.deviceId) ??
    checkClientCreatedAt(write.clientCreatedAt)
  )
}

export const rejectForGame = (game: Pick<EngineGame, "system" | "format">, write: GameWrite) =>
  (write.kind === "commander.claim" || write.kind === "commander.resolve") &&
  !isCommanderFormat(game.system, game.format)
    ? rejected("Commander damage is only available in Commander games")
    : null

const failed = (error: EngineError): GameWriteResult => ({ ok: false, error })

const acknowledged = (ack: GameAck): GameWriteResult => ({ ok: true, ack })

function* ownedSeat(
  store: GameStore,
  id: string,
  actor: SeatActor,
  message = "Seat-owner permission required",
) {
  const seat = yield* read(store.seat(id))
  return seat && controlsSeat(seat, actor) ? seat : writeError("seat_owner_required", message)
}

function* admitNewWrite(store: GameStore) {
  yield* read(store.beforeNewWrite?.())
}

export function* writeGame(
  store: GameStore,
  identity: Omit<SeatActor, "deviceId">,
  write: GameWrite,
  now: number,
): GameSteps<GameWriteResult> {
  const invalid = rejectRequest(write) ?? rejectForGame(store.game, write)
  if (invalid) return failed(invalid)
  const actor = { ...identity, deviceId: write.deviceId }
  if (write.kind === "life") return yield* writeLife(store, actor, write, now)
  if (write.kind === "table") return yield* writeTable(store, actor, write, now)
  if (write.kind === "commander.claim") return yield* writeClaim(store, actor, write, now)
  return yield* writeResolution(store, actor, write, now)
}

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

function* writeLife(
  store: GameStore,
  actor: SeatActor,
  write: WriteOf<"life">,
  now: number,
): GameSteps<GameWriteResult> {
  const seat = yield* ownedSeat(store, write.playerId, actor)
  if (isEngineError(seat)) return failed(seat)
  const { operationId } = write
  const request = { ...write, playerId: seat.id, actorUserId: actor.userId }
  const retry = matchLifeRetry(yield* read(store.event(operationId)), request)
  if (retry === "duplicate")
    return acknowledged({ operationId, deduplicated: true, currentLife: seat.currentLife })
  if (retry !== "new") return failed(retry)
  yield* admitNewWrite(store)
  const inactive = checkActive(store.game)
  if (inactive) return failed(inactive)
  const { currentLife, changes } = changeLife(store.game, seat, request, now)
  yield* read(store.apply(changes))
  return acknowledged({ operationId, deduplicated: false, currentLife })
}

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

export interface TableActionRequest extends WriteRequest {
  actorUserId: string
  action: TableAction
  actionIdentity: string
}

export function matchTableRetry(
  previous: GameEventRecord | undefined,
  playerId: string,
  request: TableActionRequest,
): RetryMatch {
  if (!previous) return "new"
  return previous.kind === request.action.kind &&
    previous.playerId === playerId &&
    previous.actionIdentity === request.actionIdentity &&
    previous.actorUserId === request.actorUserId &&
    previous.deviceId === request.deviceId &&
    previous.clientCreatedAt === request.clientCreatedAt
    ? "duplicate"
    : MISMATCH
}

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
    players: Object.fromEntries([...rows.values()].map((row) => [row.id, seatTable(row)])),
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

function* writeTable(
  store: GameStore,
  actor: SeatActor,
  write: WriteOf<"table">,
  now: number,
): GameSteps<GameWriteResult> {
  const action = gatedTableAction(write.action)
  const seat = yield* ownedSeat(store, action.playerId, actor)
  if (isEngineError(seat)) return failed(seat)
  const { operationId } = write
  const request = {
    ...write,
    action,
    actorUserId: actor.userId,
    actionIdentity: tableActionIdentity(write.action),
  }
  const retry = matchTableRetry(yield* read(store.event(operationId)), seat.id, request)
  if (retry === "duplicate") return acknowledged({ operationId, deduplicated: true })
  if (retry !== "new") return failed(retry)
  yield* admitNewWrite(store)
  const inactive = checkActive(store.game)
  if (inactive) return failed(inactive)
  const relatedId = tableRelatedSeatId(action, seat)
  const related = relatedId === undefined ? undefined : yield* read(store.seat(relatedId))
  const outcome = changeTable(store.game, seat, related, request, now)
  if (isEngineError(outcome)) return failed(outcome)
  yield* read(store.apply(outcome.changes))
  return acknowledged({ operationId, deduplicated: false })
}

export const declinedClaimOperationId = (operationId: string) => `${operationId}_declined`

const isSamePair = (left: CommanderPair, right: CommanderPair) =>
  left.fromPlayerId === right.fromPlayerId &&
  left.toPlayerId === right.toPlayerId &&
  left.commander === right.commander

export function submitClaim(
  pair: CommanderPair,
  status: "pending" | "declined",
  target: EngineSeat,
  request: CommanderClaimRequest,
  now: number,
): GameChange[] {
  const declined = status === "declined"
  const event = {
    playerId: target.id,
    delta: request.delta,
    fromPlayerId: pair.fromPlayerId,
    toPlayerId: target.id,
    ...commanderField(pair.commander),
    claimOperationId: request.operationId,
    clientCreatedAt: request.clientCreatedAt,
    serverCreatedAt: now,
  }
  const changes: GameChange[] = [
    {
      kind: "claim.insert",
      claim: {
        operationId: request.operationId,
        fromPlayerId: pair.fromPlayerId,
        toPlayerId: target.id,
        ...commanderField(pair.commander),
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
  return changes
}

function* writeClaim(
  store: GameStore,
  actor: SeatActor,
  write: WriteOf<"commander.claim">,
  now: number,
): GameSteps<GameWriteResult> {
  const inactive = checkActive(store.game)
  if (inactive) return failed(inactive)
  const source = yield* ownedSeat(
    store,
    write.fromPlayerId,
    actor,
    "Seat-owner permission required for the attacking seat",
  )
  if (isEngineError(source)) return failed(source)
  const target = yield* read(store.seat(write.toPlayerId))
  if (!target) return failed(rejected("Commander damage target must belong to this game"))
  const { operationId } = write
  const commander = write.commander === PARTNER_COMMANDER ? PARTNER_COMMANDER : undefined
  const request = { ...write, commander, actorUserId: actor.userId }
  const existing = yield* read(store.claim(operationId))
  if (existing)
    return isSameCommanderClaim(existing, request)
      ? acknowledged({ operationId, deduplicated: true, status: existing.status })
      : failed(MISMATCH)
  if (yield* read(store.event(operationId))) return failed(MISMATCH)
  yield* admitNewWrite(store)
  const pair: CommanderPair = { fromPlayerId: source.id, toPlayerId: target.id, commander }
  const total = yield* read(store.pairTotal(pair))
  const pending = yield* read(store.pendingClaims())
  const status = commanderClaimOutcome({
    total,
    delta: write.delta,
    pendingClaims: pending.length,
    pairHasPendingClaim: pending.some((claim) => isSamePair(claim, pair)),
  })
  if (status === "declined" && (yield* read(store.event(declinedClaimOperationId(operationId)))))
    return failed(MISMATCH)
  yield* read(store.apply(submitClaim(pair, status, target, request, now)))
  return acknowledged({ operationId, deduplicated: false, status })
}

export interface ResolutionRequest extends WriteRequest {
  actorUserId: string
  resolutionOperationId?: string
}

export const resolutionEventIds = (claim: CommanderClaimRecord) => [
  ...(claim.resolutionOperationId ? [claim.resolutionOperationId] : []),
  `${claim.operationId}_${claim.status}`,
]

function* recordedResolution(store: GameStore, claim: CommanderClaimRecord) {
  for (const operationId of resolutionEventIds(claim)) {
    const event = yield* read(store.event(operationId))
    if (event) return event
  }
  return undefined
}

export function rebindResolution(
  claim: CommanderClaimRecord,
  recorded: GameEventRecord | undefined,
  request: ResolutionRequest & { resolutionOperationId: string },
): GameChange[] | EngineError {
  const { resolutionOperationId } = request
  if (
    !recorded ||
    !isSameCommanderResolution(recorded, {
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
  if (recorded.operationId !== resolutionOperationId)
    changes.push({
      kind: "event.rekey",
      operationId: recorded.operationId,
      to: resolutionOperationId,
    })
  return changes
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
    ...commanderField(claim.commander),
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
  if (!confirmed) return rejected("Commander damage total must remain between 0 and 99")
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
        ...commanderField(claim.commander),
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

function* writeResolution(
  store: GameStore,
  actor: SeatActor,
  write: WriteOf<"commander.resolve">,
  now: number,
): GameSteps<GameWriteResult> {
  const claim = yield* read(store.claim(write.operationId))
  if (!claim) return failed(rejected("Commander damage claim not found"))
  const { decision, resolutionOperationId } = write
  if (
    resolutionOperationId &&
    claim.resolutionOperationId &&
    claim.resolutionOperationId !== resolutionOperationId
  )
    return failed(MISMATCH)
  const target = yield* ownedSeat(
    store,
    claim.toPlayerId,
    actor,
    "Seat-owner permission required for the defending seat",
  )
  if (isEngineError(target)) return failed(target)
  const request = { ...write, actorUserId: actor.userId }
  if (resolutionOperationId) {
    const bound = yield* read(store.event(resolutionOperationId))
    if (
      bound &&
      (bound.claimOperationId !== claim.operationId || bound.kind !== `commanderDamage.${decision}`)
    )
      return failed(MISMATCH)
  }
  const operationId = resolutionOperationId ?? claim.operationId
  if (claim.status !== "pending") {
    if (resolutionOperationId) {
      if (claim.status !== decision) return failed(MISMATCH)
      const rebound = rebindResolution(claim, yield* recordedResolution(store, claim), {
        ...request,
        resolutionOperationId,
      })
      if (isEngineError(rebound)) return failed(rebound)
      yield* read(store.apply(rebound))
    }
    const replayed = { operationId, deduplicated: true, status: claim.status }
    if (decision !== "confirmed" || claim.status !== "confirmed") return acknowledged(replayed)
    const total = yield* read(store.pairTotal(claim))
    return acknowledged({ ...replayed, total, currentLife: target.currentLife })
  }
  yield* admitNewWrite(store)
  const inactive = checkActive(store.game)
  if (inactive) return failed(inactive)
  const pairTotal = decision === "confirmed" ? yield* read(store.pairTotal(claim)) : 0
  const outcome = resolveClaim(claim, decision, pairTotal, target, request, now)
  if (isEngineError(outcome)) return failed(outcome)
  yield* read(store.apply(outcome.changes))
  const { total, currentLife } = outcome
  return acknowledged({
    operationId,
    deduplicated: false,
    status: decision,
    ...(total === undefined ? {} : { total, currentLife }),
  })
}
