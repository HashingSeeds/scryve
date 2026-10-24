import { translate } from "@/i18n/translate"

import { PLAYER_COLOR_CHOICES, shapeForSeat } from "../../../convex/lib/appearance"
import {
  commanderTotals,
  writeMemoryGame,
  type MemoryGame,
  type MemoryWrite,
  type MemoryWriteResult,
} from "../../../convex/lib/gameEngineMemory"
import { commanderLethalDamage } from "../../../convex/lib/gameRules"
import {
  isPlayerGridLayoutVariant,
  type PlayerGridLayoutVariant,
} from "../../../convex/lib/layouts"
import { outReason } from "../../../convex/lib/outReason"
import {
  identitySection,
  startingValueRange,
  systemDefinition,
  tableRules,
} from "../../../convex/lib/systems"
import {
  matchesValidator,
  TABLE_VERSION,
  tableActionValidator,
  tableForVersion,
  type PlayerTable,
} from "../../../convex/lib/table"
import {
  dealTreacheryRoles,
  isTreacheryPlayerCount,
  treacheryOutcome,
  type GameVariant,
  type TreacheryRole,
} from "../../../convex/lib/treachery"
import { projectionOutState } from "../connected/boardView"
import {
  CONNECTED_RECENT_OPERATION_LIMIT,
  toConnectedProjection,
  type ConnectedActionEvent,
  type ConnectedProjection,
} from "../connected/model"
import {
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  asPlayerId,
  MAX_PLAYER_NAME_LENGTH,
  MAX_PLAYERS,
  wellFormedPlayerName,
} from "../game/domain"
import { isPlaySystemId, playSystemFormats, type PlaySystemId } from "../game/playSystems"

// why: guests and hosts from before the shared game engine speak a different protocol, so each side turns the other away with a clear reason.
export const LAN_PROTOCOL = 2
export const LAN_MAX_SEATS = MAX_PLAYERS
export const LAN_MIN_PLAYERS = 2

export interface LanSetup {
  playerCount: number
  startingLife: number
  lifeStep: number
  ruleset: string
  system?: PlaySystemId
  format?: string
  layout?: PlayerGridLayoutVariant
  variant?: GameVariant
}

export interface LanSeatDeck {
  versionId: string
  name: string
  startingValue?: number
}

export interface LanSeat {
  key: string
  seat: number
  name: string
  connected: boolean
  deck?: LanSeatDeck
}

export type LanStatus = "lobby" | "active" | "finished" | "abandoned"

export interface LanLobby {
  id: string
  status: LanStatus
  round: number
  setup: LanSetup
  seats: LanSeat[]
}

export interface LanDealtRole {
  role: TreacheryRole
  roleRevealed: boolean
}

export interface LanGame extends LanLobby {
  hostKey: string
  roles?: Readonly<Record<string, LanDealtRole>>
  memory?: MemoryGame
  recentOperationIds: string[]
  startedAt?: number
  updatedAt: number
}

export interface LanSeatPass {
  key: string
  token: string
}

export type LanGuestMessage =
  | {
      type: "join"
      protocol: number
      name: string
      pass?: LanSeatPass
      systems?: readonly PlaySystemId[]
      variants?: readonly GameVariant[]
    }
  | { type: "op"; event: ConnectedActionEvent }
  | { type: "reveal" }
  | { type: "deck"; deck: LanSeatDeck | null }

export type LanHostMessage =
  | { type: "welcome"; pass: LanSeatPass }
  | { type: "rejected"; reason: string }
  | { type: "outdated" }
  | { type: "state"; lobby: LanLobby; projection: ConnectedProjection }
  | { type: "ack"; operationId: string }
  | { type: "nack"; operationId: string; code?: string; message: string }

export const lanRoundId = (game: Pick<LanLobby, "id" | "round">) => `${game.id}-${game.round}`

export const connectedSeatCount = (game: Pick<LanLobby, "seats">) =>
  game.seats.filter((seat) => seat.connected).length

const fitsVariant = ({ variant, playerCount }: LanSetup, count = playerCount) =>
  variant !== "treachery" || isTreacheryPlayerCount(count)

export const lanSeatsReady = (game: Pick<LanLobby, "seats" | "setup">) =>
  game.seats.length === game.setup.playerCount &&
  connectedSeatCount(game) === game.seats.length &&
  fitsVariant(game.setup)

export function createLanGame(
  id: string,
  hostKey: string,
  name: string,
  setup: LanSetup,
  now: number,
): LanGame {
  return {
    id,
    hostKey,
    status: "lobby",
    round: 0,
    setup,
    seats: [{ key: hostKey, seat: 1, name, connected: true }],
    recentOperationIds: [],
    updatedAt: now,
  }
}

export const lanLobbyOf = ({ id, status, round, setup, seats }: LanGame): LanLobby => ({
  id,
  status,
  round,
  setup,
  seats,
})

const withSeat = (game: LanGame, key: string, update: (seat: LanSeat) => LanSeat): LanGame => ({
  ...game,
  seats: game.seats.map((seat) => (seat.key === key ? update(seat) : seat)),
})

const LAN_REJECTION_IDS = ["seatTaken", "started", "full", "update"] as const

/** why: the wire carries English so hosts and guests on different builds still understand each other; each device translates on receipt. */
const LAN_REJECTIONS: Record<(typeof LAN_REJECTION_IDS)[number], string> = {
  seatTaken: "That seat belongs to another device.",
  started: "This game has already started.",
  full: "This game is full.",
  update: "Update Scryve to join this game.",
}

/** why: guests from before `systems` drop a lobby in a system they don't know and wait forever, so a newer system asks them to update. */
const SYSTEMS_BEFORE_GUEST_LIST: readonly PlaySystemId[] = ["mtg", "ygo", "pokemon"]

export function lanRejectionMessage(reason: string) {
  const id = LAN_REJECTION_IDS.find((candidate) => LAN_REJECTIONS[candidate] === reason)
  return id ? translate(`connected:nearby.rejected.${id}`) : reason
}

// why: the host's seat has no token anywhere, so no pass can ever claim it; a pass for a seat the lobby already freed just gets a new one.
export function admitLanGuest(
  game: LanGame,
  tokens: ReadonlyMap<string, string>,
  join: Extract<LanGuestMessage, { type: "join" }>,
  fresh: LanSeatPass,
): { game: LanGame; pass: LanSeatPass } | { rejected: string } {
  const { system } = game.setup
  const systems = join.systems ?? SYSTEMS_BEFORE_GUEST_LIST
  const { variant } = game.setup
  if (
    join.protocol !== LAN_PROTOCOL ||
    (system && !systems.includes(system)) ||
    (variant && !join.variants?.includes(variant))
  )
    return { rejected: LAN_REJECTIONS.update }
  const { pass } = join
  const owned = pass && game.seats.some((seat) => seat.key === pass.key)
  if (pass && (pass.key === game.hostKey || (owned && tokens.get(pass.key) !== pass.token)))
    return { rejected: LAN_REJECTIONS.seatTaken }
  if (pass && owned)
    return {
      game: withSeat(game, pass.key, (seat) => ({ ...seat, name: join.name, connected: true })),
      pass,
    }
  if (game.status !== "lobby") return { rejected: LAN_REJECTIONS.started }
  if (game.seats.length >= game.setup.playerCount) return { rejected: LAN_REJECTIONS.full }
  const seat: LanSeat = {
    key: fresh.key,
    seat: game.seats.length + 1,
    name: join.name,
    connected: true,
  }
  return { game: { ...game, seats: [...game.seats, seat] }, pass: fresh }
}

export function setLanPlayerCount(game: LanGame, playerCount: number): LanGame {
  if (
    game.status !== "lobby" ||
    !Number.isInteger(playerCount) ||
    playerCount < Math.max(LAN_MIN_PLAYERS, game.seats.length) ||
    playerCount > LAN_MAX_SEATS ||
    !fitsVariant(game.setup, playerCount)
  )
    return game
  return { ...game, setup: { ...game.setup, playerCount } }
}

const choosesDecks = (game: LanGame) =>
  Boolean(game.setup.system) && (game.status === "lobby" || game.status === "finished")

export function setLanDeck(game: LanGame, key: string, deck: LanSeatDeck | null): LanGame {
  if (!choosesDecks(game)) return game
  return withSeat(game, key, ({ deck: _previous, ...seat }) => (deck ? { ...seat, deck } : seat))
}

export const setLanConnected = (game: LanGame, key: string, connected: boolean) =>
  withSeat(game, key, (seat) => ({ ...seat, connected }))

// why: only the lobby frees a seat; once a game has started, a departed guest keeps it to reconnect with its pass.
export function releaseLanSeat(game: LanGame, key: string): LanGame {
  if (game.status !== "lobby") return setLanConnected(game, key, false)
  return {
    ...game,
    seats: game.seats
      .filter((seat) => seat.key !== key)
      .map((seat, index) => ({ ...seat, seat: index + 1 })),
  }
}

function dealLanRoles(game: LanGame, random: () => number) {
  if (game.setup.variant !== "treachery") return undefined
  const roles = dealTreacheryRoles(game.seats.length, random)
  return Object.fromEntries(
    game.seats.map((seat, index) => {
      const role = roles[index]!
      return [seat.key, { role, roleRevealed: role === "leader" }]
    }),
  )
}

export function startingLifeFor(setup: LanSetup, deck: LanSeatDeck | undefined) {
  const value = deck?.startingValue
  const { max } = startingValueRange(setup.system)
  return identitySection(setup.system, setup.format)?.startingValueFacet &&
    value !== undefined &&
    value >= 1 &&
    value <= max
    ? value
    : setup.startingLife
}

export function startLanRound(game: LanGame, now: number, random = Math.random): LanGame {
  const { setup } = game
  const { roles: _lastRound, ...rest } = game
  const roles = dealLanRoles(game, random)
  return {
    ...rest,
    ...(roles ? { roles } : {}),
    status: "active",
    round: game.round + 1,
    recentOperationIds: [],
    startedAt: now,
    updatedAt: now,
    memory: {
      status: "active",
      system: setup.system,
      format: setup.format,
      designations: {},
      seats: new Map(
        game.seats.map((seat) => [
          seat.key,
          {
            id: seat.key,
            userId: seat.key,
            currentLife: startingLifeFor(setup, seat.deck),
            eventCount: 0,
          },
        ]),
      ),
      events: new Map(),
      claims: new Map(),
      pairs: new Map(),
    },
  }
}

export function revealLanRole(game: LanGame, key: string, now: number): LanGame {
  const dealt = game.roles?.[key]
  if (game.status !== "active" || !dealt || dealt.roleRevealed) return game
  return {
    ...game,
    roles: { ...game.roles, [key]: { ...dealt, roleRevealed: true } },
    updatedAt: now,
  }
}

export function endLanRound(game: LanGame, status: "finished" | "abandoned", now: number): LanGame {
  if (game.memory) game.memory.status = status
  return { ...game, status, updatedAt: now }
}

function memoryWriteOf(event: ConnectedActionEvent): MemoryWrite {
  const sent = {
    operationId: event.operationId,
    deviceId: event.deviceId,
    clientCreatedAt: event.clientCreatedAt,
  }
  if (event.type === "life.changed")
    return { kind: "life", playerId: event.playerId, delta: event.delta, ...sent }
  if (event.type === "table.action") return { kind: "table", action: event.action, ...sent }
  if (event.type === "commanderDamage.submitted")
    return {
      kind: "commander.claim",
      fromPlayerId: event.fromPlayerId,
      toPlayerId: event.toPlayerId,
      delta: event.delta,
      ...sent,
    }
  return {
    kind: "commander.resolve",
    decision: event.accepted ? "confirmed" : "declined",
    operationId: event.claimOperationId,
    resolutionOperationId: event.operationId,
    deviceId: event.deviceId,
    clientCreatedAt: event.clientCreatedAt,
  }
}

const NOT_STARTED: MemoryWriteResult = {
  ok: false,
  error: { kind: "rejected", code: "game_not_active", message: "Game is not active" },
}

export function applyLanWrite(
  game: LanGame,
  senderKey: string,
  event: ConnectedActionEvent,
  now: number,
): { game: LanGame; result: MemoryWriteResult } {
  if (!game.memory || event.gameId !== lanRoundId(game)) return { game, result: NOT_STARTED }
  const result = writeMemoryGame(
    game.memory,
    { userId: senderKey, isHost: senderKey === game.hostKey },
    memoryWriteOf(event),
    now,
  )
  if (!result.ok || result.ack.deduplicated) return { game, result }
  return {
    game: {
      ...game,
      updatedAt: now,
      recentOperationIds: [...game.recentOperationIds, event.operationId].slice(
        -CONNECTED_RECENT_OPERATION_LIMIT,
      ),
    },
    result,
  }
}

export const lanSeatAppearance = (seat: number) => ({
  color: PLAYER_COLOR_CHOICES[(seat - 1) % PLAYER_COLOR_CHOICES.length],
  shape: shapeForSeat(seat),
})

const tableRulesApply = (rules: ReturnType<typeof tableRules>) =>
  rules.counters.length > 0 || rules.designations.length > 0 || rules.pokemon !== undefined

const playerTableOf = (seat: PlayerTable): PlayerTable => ({
  ...(seat.counters ? { counters: seat.counters } : {}),
  ...(seat.pokemon ? { pokemon: seat.pokemon } : {}),
})

function commanderProjection(memory: MemoryGame, viewerKey: string, lethal: number) {
  const totals = commanderTotals(memory)
  return {
    totals,
    pendingClaims: [...memory.claims.values()]
      .filter((claim) => claim.status === "pending" && claim.toPlayerId === viewerKey)
      .map((claim) => ({
        claimId: claim.operationId,
        operationId: claim.operationId,
        fromPlayerId: claim.fromPlayerId,
        toPlayerId: claim.toPlayerId,
        delta: claim.delta,
        clientCreatedAt: claim.clientCreatedAt,
        createdAt: claim.createdAt,
      })),
    eliminatedPlayerIds: [
      ...new Set(totals.filter((total) => total.total >= lethal).map((total) => total.toPlayerId)),
    ],
  }
}

// why: shaped like Convex's lobbyProjection, so a nearby guest's board reads the same game state a cloud guest's does.
export function lanProjection(game: LanGame, viewerKey: string): ConnectedProjection {
  const { setup, memory } = game
  const rules = tableRules(setup.system, setup.format)
  const lethal = commanderLethalDamage(setup.system, setup.format)
  const commander =
    memory && lethal !== undefined ? commanderProjection(memory, viewerKey, lethal) : undefined
  const eliminated = new Set(commander?.eliminatedPlayerIds)
  const seatsOf = memory ? [...memory.seats.values()] : []
  const roleFor = (key: string) => {
    const dealt = game.roles?.[key]
    if (!dealt) return {}
    return dealt.roleRevealed || key === viewerKey || game.status === "finished"
      ? dealt
      : { roleRevealed: false }
  }
  const projection: ConnectedProjection = {
    schemaVersion: 1,
    publicId: lanRoundId(game),
    status: game.status,
    playerCount: setup.playerCount,
    ...(setup.system ? { system: setup.system } : {}),
    ...(setup.format ? { format: setup.format } : {}),
    startingLife: setup.startingLife,
    lifeStep: setup.lifeStep,
    ruleset: setup.ruleset,
    ...(setup.layout ? { layout: setup.layout } : {}),
    ...(setup.variant ? { variant: setup.variant } : {}),
    isHost: viewerKey === game.hostKey,
    eventSequence: seatsOf.reduce((total, seat) => total + (seat.eventCount ?? 0), 0),
    serverUpdatedAt: game.updatedAt,
    // why: a viewer only reconciles its own pending changes, and every id is bytes the host base64-encodes in JS for every guest on every broadcast.
    recentOperationIds: game.recentOperationIds.filter(
      (operationId) => (memory?.events.get(operationId)?.actorUserId ?? viewerKey) === viewerKey,
    ),
    players: game.seats.map((seat) => ({
      playerId: seat.key,
      seat: seat.seat,
      displayName: seat.name,
      ...lanSeatAppearance(seat.seat),
      currentLife: memory?.seats.get(seat.key)?.currentLife ?? setup.startingLife,
      ...(commander ? { eliminatedByCommanderDamage: eliminated.has(seat.key) } : {}),
      controlledByMe: seat.key === viewerKey,
      ...(seat.deck ? { deckVersionId: seat.deck.versionId } : {}),
      ...roleFor(seat.key),
    })),
    ...(commander ? { commanderDamage: commander } : {}),
    ...(memory && tableRulesApply(rules)
      ? {
          table: tableForVersion(
            {
              designations: memory.designations,
              players: Object.fromEntries(seatsOf.map((seat) => [seat.id, playerTableOf(seat)])),
            },
            TABLE_VERSION,
          ),
        }
      : {}),
  }
  const outState = projectionOutState(projection)
  const outcome =
    game.roles && game.status === "active" && viewerKey === game.hostKey
      ? treacheryOutcome(
          projection.players.flatMap((player) => {
            const dealt = game.roles?.[player.playerId]
            return dealt
              ? [
                  {
                    playerId: player.playerId,
                    role: dealt.role,
                    inGame: !outReason(outState, player.playerId),
                  },
                ]
              : []
          }),
        )
      : undefined
  return outcome ? { ...projection, treacheryOutcome: outcome } : projection
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const isWhole = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value)

const isPass = (value: unknown): value is LanSeatPass =>
  isRecord(value) &&
  typeof value.key === "string" &&
  value.key.length <= 64 &&
  typeof value.token === "string" &&
  value.token.length <= 128

export function parseLanSetup(value: unknown): LanSetup | null {
  if (!isRecord(value)) return null
  const { playerCount, startingLife, lifeStep, ruleset, system, format, layout, variant } = value
  if (
    !Number.isInteger(playerCount) ||
    (playerCount as number) < LAN_MIN_PLAYERS ||
    (playerCount as number) > LAN_MAX_SEATS ||
    !isWhole(startingLife) ||
    !isCount(lifeStep) ||
    lifeStep < 1 ||
    typeof ruleset !== "string" ||
    ruleset.length > 64
  )
    return null
  const setup = {
    playerCount: playerCount as number,
    startingLife,
    lifeStep,
    ruleset,
    ...(isPlayerGridLayoutVariant(layout) ? { layout } : {}),
  }
  if (system === undefined) return setup
  if (
    !isPlaySystemId(system) ||
    typeof format !== "string" ||
    !playSystemFormats(system).some(({ id }) => id === format)
  )
    return null
  return {
    ...setup,
    system,
    format,
    ...(variant === "treachery" && systemDefinition(system)?.variants.includes(variant)
      ? { variant }
      : {}),
  }
}

const MAX_DECK_NAME_LENGTH = 120

function parseSeatDeck(value: unknown): LanSeatDeck | null {
  if (!isRecord(value) || !isId(value.versionId) || typeof value.name !== "string") return null
  const { startingValue } = value
  return {
    versionId: value.versionId,
    name: value.name.slice(0, MAX_DECK_NAME_LENGTH),
    ...(isCount(startingValue) ? { startingValue } : {}),
  }
}

function parseEvent(value: unknown): ConnectedActionEvent | null {
  if (!isRecord(value)) return null
  const { operationId, gameId, actorId, deviceId, clientCreatedAt } = value
  if (!isId(operationId) || !isId(gameId) || !isId(actorId) || !isId(deviceId)) return null
  if (!isCount(clientCreatedAt)) return null
  const base = {
    operationId: asOperationId(operationId),
    gameId: asGameId(gameId),
    actorId: asActorId(actorId),
    deviceId: asDeviceId(deviceId),
    clientCreatedAt,
  }
  if (value.type === "life.changed" && isId(value.playerId) && isWhole(value.delta))
    return {
      type: "life.changed",
      ...base,
      playerId: asPlayerId(value.playerId),
      delta: value.delta,
    }
  if (value.type === "table.action" && matchesValidator(tableActionValidator, value.action))
    return { type: "table.action", ...base, action: value.action }
  if (
    value.type === "commanderDamage.submitted" &&
    isId(value.fromPlayerId) &&
    isId(value.toPlayerId) &&
    isWhole(value.delta)
  )
    return {
      type: "commanderDamage.submitted",
      ...base,
      fromPlayerId: asPlayerId(value.fromPlayerId),
      toPlayerId: asPlayerId(value.toPlayerId),
      delta: value.delta,
    }
  if (
    value.type === "commanderDamage.resolved" &&
    isId(value.claimOperationId) &&
    isId(value.toPlayerId) &&
    typeof value.accepted === "boolean"
  )
    return {
      type: "commanderDamage.resolved",
      ...base,
      claimOperationId: asOperationId(value.claimOperationId),
      toPlayerId: asPlayerId(value.toPlayerId),
      accepted: value.accepted,
    }
  return null
}

export function parseGuestMessage(line: string): LanGuestMessage | null {
  const value: unknown = JSON.parse(line)
  if (!isRecord(value)) return null
  const name = typeof value.name === "string" ? wellFormedPlayerName(value.name) : ""
  if (value.type === "join" && name && (value.pass === undefined || isPass(value.pass)))
    return {
      type: "join",
      protocol: typeof value.protocol === "number" ? value.protocol : 1,
      name,
      ...(value.pass ? { pass: { key: value.pass.key, token: value.pass.token } } : {}),
      ...(Array.isArray(value.systems) ? { systems: value.systems.filter(isPlaySystemId) } : {}),
      ...(Array.isArray(value.variants)
        ? { variants: value.variants.filter((variant) => variant === "treachery") }
        : {}),
    }
  if (value.type === "reveal") return { type: "reveal" }
  if (value.type === "deck") {
    const deck = value.deck === null ? null : parseSeatDeck(value.deck)
    return value.deck === null || deck ? { type: "deck", deck } : null
  }
  if (value.type === "op") {
    const event = parseEvent(value.event)
    return event ? { type: "op", event } : null
  }
  return null
}

const LAN_STATUSES: readonly LanStatus[] = ["lobby", "active", "finished", "abandoned"]

function parseLobby(value: unknown): LanLobby | null {
  if (!isRecord(value) || !isId(value.id) || !isCount(value.round)) return null
  const status = LAN_STATUSES.find((candidate) => candidate === value.status)
  const setup = parseLanSetup(value.setup)
  if (!status || !setup || !Array.isArray(value.seats) || value.seats.length > LAN_MAX_SEATS)
    return null
  const seats: LanSeat[] = []
  for (const seat of value.seats) {
    if (
      !isRecord(seat) ||
      !isId(seat.key) ||
      !Number.isInteger(seat.seat) ||
      typeof seat.name !== "string" ||
      typeof seat.connected !== "boolean"
    )
      return null
    const deck = parseSeatDeck(seat.deck)
    seats.push({
      key: seat.key,
      seat: seat.seat as number,
      name: seat.name.slice(0, MAX_PLAYER_NAME_LENGTH),
      connected: seat.connected,
      ...(deck ? { deck } : {}),
    })
  }
  return { id: value.id, status, round: value.round, setup, seats }
}

export function parseHostMessage(line: string): LanHostMessage | null {
  const value: unknown = JSON.parse(line)
  if (!isRecord(value)) return null
  if (value.type === "rejected" && typeof value.reason === "string")
    return { type: "rejected", reason: value.reason }
  if (value.type === "welcome" && isPass(value.pass))
    return { type: "welcome", pass: { key: value.pass.key, token: value.pass.token } }
  if (value.type === "game") return { type: "outdated" }
  if (value.type === "state") {
    const lobby = parseLobby(value.lobby)
    const projection = toConnectedProjection(value.projection)
    return lobby && projection ? { type: "state", lobby, projection } : null
  }
  if (value.type === "ack" && isId(value.operationId))
    return { type: "ack", operationId: value.operationId }
  if (value.type === "nack" && isId(value.operationId) && typeof value.message === "string")
    return {
      type: "nack",
      operationId: value.operationId,
      ...(typeof value.code === "string" ? { code: value.code } : {}),
      message: value.message,
    }
  return null
}
