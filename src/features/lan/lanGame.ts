import { translate } from "@/i18n/translate"

import { encodeLine, MAX_LINE_BYTES } from "./lineReader"
import { PLAYER_COLOR_CHOICES, shapeForSeat } from "../../../convex/lib/appearance"
import type {
  ClaimStatus,
  GameWrite as MemoryWrite,
  GameWriteResult as MemoryWriteResult,
} from "../../../convex/lib/gameEngine"
import {
  commanderTotals,
  writeMemoryGame,
  type MemoryGame,
} from "../../../convex/lib/gameEngineMemory"
import {
  connectedLogEvent,
  NEARBY_LOG_LIMIT,
  type ConnectedLogEvent,
} from "../../../convex/lib/gameLog"
import {
  commanderField,
  commanderLethalDamage,
  isCommanderSlot,
  lastChangeFor,
} from "../../../convex/lib/gameRules"
import {
  isPlayerGridLayoutVariant,
  type PlayerGridLayoutVariant,
} from "../../../convex/lib/layouts"
import { outReason } from "../../../convex/lib/outReason"
import {
  hasTable,
  identitySection,
  startingValueRange,
  systemDefinition,
  tableRules,
} from "../../../convex/lib/systems"
import {
  matchesValidator,
  TABLE_VERSION,
  TURN_TABLE_VERSION,
  tableActionValidator,
  tableForVersion,
  type PlayerTable,
} from "../../../convex/lib/table"
import {
  ARCHENEMY_LIFE,
  CLIENT_VARIANTS,
  isValidModeSetup,
  modeSetupValidator,
  PLANECHASE_CAPABILITY,
  revealedModes,
  modeGameFields,
  startModes,
  type ModeSetup,
} from "../../../convex/lib/tableModes"
import {
  dealTreacheryRoles,
  isTreacheryPlayerCount,
  treacheryOutcome,
  type GameVariant,
  type TreacheryRole,
} from "../../../convex/lib/treachery"
import {
  isTwoHeadedGiantPlayerCount,
  pairedTeams,
  TWO_HEADED_GIANT,
} from "../../../convex/lib/twoHeadedGiant"
import { projectionOutState } from "../connected/boardView"
import {
  CONNECTED_RECENT_OPERATION_LIMIT,
  toConnectedProjection,
  type ConnectedActionEvent,
  type ConnectedProjection,
} from "../connected/model"
import { parseLatencySummary, type SyncLatencySummary } from "../connected/syncLatency"
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
  modeSetup?: ModeSetup
}

export interface LanSeatDeck {
  // why: a shared deck has no version of this player's, so its `shared-` key stands in.
  versionId: string
  name: string
  startingValue?: number
  /** why: a shared deck has no version to read back, so its list is named by fingerprint. */
  fingerprint?: string
}

export interface LanSeat {
  key: string
  seat: number
  name: string
  connected: boolean
  deck?: LanSeatDeck
  editsAnySeat?: boolean
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
      variants?: readonly string[]
      editsAnySeat?: boolean
      /** why: a guest sends the table it can parse, so a host leaves out a turn an older guest's strict parser would drop the whole table over. */
      tableVersion?: number
    }
  | { type: "op"; event: ConnectedActionEvent; tappedAt?: number }
  | { type: "reveal" }
  | { type: "log"; before?: string }
  | { type: "deck"; deck: LanSeatDeck | null }
  | { type: "ping"; at: number }
  | { type: "stats"; stats: SyncLatencySummary }

export type LanHostMessage =
  // why: a host from before partners drops the slot and lands a partner's damage on the first commander, so guests offer partners only when the welcome says so. A flag keeps mixed tables playing where a LAN_PROTOCOL bump would split them.
  // why: a host from before turns rejects turn writes, so guests show the turn tab only when the welcome says so.
  | {
      type: "welcome"
      pass: LanSeatPass
      partners?: boolean
      editsAnySeat?: boolean
      turns?: boolean
      /** why: a host from before the game log ignores a guest's log request, so guests offer the log only when the welcome says so. */
      log?: boolean
    }
  | { type: "rejected"; reason: string }
  | { type: "outdated" }
  | { type: "state"; lobby: LanLobby; projection: ConnectedProjection }
  | { type: "ack"; operationId: string; status?: ClaimStatus }
  | { type: "nack"; operationId: string; code?: string; message: string }
  | { type: "pong"; at: number; hostAt: number }
  | ({ type: "log" } & LanLogPage)

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
    seats: [{ key: hostKey, seat: 1, name, connected: true, editsAnySeat: true }],
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
  const { variant, modeSetup } = game.setup
  if (
    join.protocol !== LAN_PROTOCOL ||
    (system && !systems.includes(system)) ||
    (variant && !join.variants?.includes(variant)) ||
    (modeSetup?.planechase && !join.variants?.includes(PLANECHASE_CAPABILITY))
  )
    return { rejected: LAN_REJECTIONS.update }
  const { pass } = join
  const owned = pass && game.seats.some((seat) => seat.key === pass.key)
  if (pass && (pass.key === game.hostKey || (owned && tokens.get(pass.key) !== pass.token)))
    return { rejected: LAN_REJECTIONS.seatTaken }
  const editsAnySeat = join.editsAnySeat ? { editsAnySeat: true } : {}
  if (pass && owned)
    return {
      game: withSeat(game, pass.key, ({ editsAnySeat: _before, ...seat }) => ({
        ...seat,
        ...editsAnySeat,
        name: join.name,
        connected: true,
      })),
      pass,
    }
  if (game.status !== "lobby") return { rejected: LAN_REJECTIONS.started }
  if (game.seats.length >= game.setup.playerCount) return { rejected: LAN_REJECTIONS.full }
  const seat: LanSeat = {
    key: fresh.key,
    seat: firstOpenSeat(game.seats),
    name: join.name,
    connected: true,
    ...editsAnySeat,
  }
  return {
    game: { ...game, seats: [...game.seats, seat].sort((left, right) => left.seat - right.seat) },
    pass: fresh,
  }
}

const firstOpenSeat = (seats: readonly LanSeat[]) => {
  let seat = 1
  while (seats.some((taken) => taken.seat === seat)) seat += 1
  return seat
}

/** why: the host trades two seats to change Two-Headed Giant teams. An open seat trades too, so a lobby may keep a gap, which the next guest fills. */
export function swapLanSeats(game: LanGame, first: number, second: number): LanGame {
  const inRange = (seat: number) =>
    Number.isInteger(seat) && seat >= 1 && seat <= game.setup.playerCount
  if (game.status !== "lobby" || first === second || !inRange(first) || !inRange(second))
    return game
  const traded = (seat: number) => (seat === first ? second : seat === second ? first : seat)
  return {
    ...game,
    seats: game.seats
      .map((seat) => ({ ...seat, seat: traded(seat.seat) }))
      .sort((left, right) => left.seat - right.seat),
  }
}

export function setLanPlayerCount(game: LanGame, playerCount: number): LanGame {
  if (
    game.status !== "lobby" ||
    !Number.isInteger(playerCount) ||
    playerCount < Math.max(LAN_MIN_PLAYERS, ...game.seats.map(({ seat }) => seat)) ||
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

// why: only the lobby frees a seat; once a game has started, a departed guest keeps it to reconnect with its pass. Everyone else keeps their seat, so teams the host traded stay put.
export function releaseLanSeat(game: LanGame, key: string): LanGame {
  if (game.status !== "lobby") return setLanConnected(game, key, false)
  return { ...game, seats: game.seats.filter((seat) => seat.key !== key) }
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
  // why: the same seat stays the archenemy in a rematch, as in cloud and local games, and the decks shuffle again.
  const archenemySeat = game.seats.findIndex(
    ({ key }) => key === game.memory?.modes?.archenemy?.playerId,
  )
  const modeSetup =
    setup.modeSetup?.archenemy && archenemySeat >= 0
      ? { ...setup.modeSetup, archenemy: { ...setup.modeSetup.archenemy, seat: archenemySeat + 1 } }
      : setup.modeSetup
  const started = startModes(
    modeSetup,
    game.seats.map((seat) => seat.key),
    random,
  )
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
      // why: neighboring seats form the Two-Headed Giant teams, as on Convex.
      ...(setup.variant === TWO_HEADED_GIANT
        ? { variant: TWO_HEADED_GIANT, turnGroups: pairedTeams(game.seats.map(({ key }) => key)) }
        : {}),
      ...(game.seats.every((seat) => seat.editsAnySeat) ? { lifeEditing: "anyone" as const } : {}),
      designations: {},
      ...modeGameFields(started, now, `archenemy_${lanRoundId(game)}`),
      seats: new Map(
        game.seats.map((seat) => [
          seat.key,
          {
            id: seat.key,
            userId: seat.key,
            currentLife:
              started.archenemyId === seat.key
                ? ARCHENEMY_LIFE
                : setup.variant === TWO_HEADED_GIANT
                  ? setup.startingLife
                  : startingLifeFor(setup, seat.deck),
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

function memoryWriteOf(event: ConnectedActionEvent, tappedAt: number | undefined): MemoryWrite {
  const tap = tappedAt === undefined ? {} : { tappedAt }
  const sent = {
    operationId: event.operationId,
    deviceId: event.deviceId,
    clientCreatedAt: event.clientCreatedAt,
    ...tap,
  }
  if (event.type === "life.changed")
    return {
      kind: "life",
      playerId: event.playerId,
      delta: event.delta,
      ...(event.compensatesOperationId ? { undoOf: event.compensatesOperationId } : {}),
      ...sent,
    }
  if (event.type === "table.action")
    return {
      kind: "table",
      action: event.action,
      ...(event.undoOf ? { undoOf: event.undoOf } : {}),
      ...sent,
    }
  if (event.type === "commanderDamage.submitted")
    return {
      kind: "commander.claim",
      fromPlayerId: event.fromPlayerId,
      toPlayerId: event.toPlayerId,
      ...commanderField(event.commander),
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
    ...tap,
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
  tappedAt?: number,
): { game: LanGame; result: MemoryWriteResult } {
  if (!game.memory || event.gameId !== lanRoundId(game)) return { game, result: NOT_STARTED }
  const result = writeMemoryGame(
    game.memory,
    { userId: senderKey, isHost: senderKey === game.hostKey },
    memoryWriteOf(event, tappedAt),
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

const playerTableOf = (seat: PlayerTable): PlayerTable => ({
  ...(seat.counters ? { counters: seat.counters } : {}),
  ...(seat.customCounters ? { customCounters: seat.customCounters } : {}),
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
        ...commanderField(claim.commander),
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
export function lanProjection(
  game: LanGame,
  viewerKey: string,
  tableVersion = TABLE_VERSION,
): ConnectedProjection {
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
    ...(setup.modeSetup ? { modeSetup: setup.modeSetup } : {}),
    isHost: viewerKey === game.hostKey,
    ...(memory?.lifeEditing === "anyone" ? { lifeEditing: "anyone" as const } : {}),
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
      ...(seat.editsAnySeat ? { editsAnySeat: true } : {}),
      ...(seat.deck ? { deckVersionId: seat.deck.versionId } : {}),
      ...roleFor(seat.key),
    })),
    ...(commander ? { commanderDamage: commander } : {}),
    ...(memory &&
    (hasTable(rules) ||
      ((memory.turn || memory.turnGroups) && tableVersion >= TURN_TABLE_VERSION) ||
      (memory.modes && tableVersion >= TABLE_VERSION))
      ? {
          table: tableForVersion(
            {
              designations: memory.designations,
              players: Object.fromEntries(seatsOf.map((seat) => [seat.id, playerTableOf(seat)])),
              ...(memory.turn ? { turn: memory.turn } : {}),
              ...(memory.turnGroups ? { turnGroups: memory.turnGroups } : {}),
              ...(memory.modes ? { modes: revealedModes(memory.modes) } : {}),
            },
            tableVersion,
          ),
        }
      : {}),
  }
  const lastChanged = seatsOf.reduce<(typeof seatsOf)[number] | undefined>(
    (latest, seat) => ((seat.lastEventAt ?? 0) > (latest?.lastEventAt ?? 0) ? seat : latest),
    undefined,
  )
  const lastChange =
    game.status === "active"
      ? lastChangeFor(lastChanged, { userId: viewerKey }, game.hostKey)
      : undefined
  if (lastChange) projection.lastChange = lastChange
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
  const {
    playerCount,
    startingLife,
    lifeStep,
    ruleset,
    system,
    format,
    layout,
    variant,
    modeSetup,
  } = value
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
    ...((variant === "treachery" ||
      variant === "archenemy" ||
      (variant === TWO_HEADED_GIANT && isTwoHeadedGiantPlayerCount(setup.playerCount))) &&
    systemDefinition(system)?.variants.includes(variant)
      ? { variant }
      : {}),
    ...(matchesValidator(modeSetupValidator, modeSetup) &&
    isValidModeSetup(modeSetup, playerCount as number) &&
    (modeSetup.archenemy !== undefined) === (variant === "archenemy")
      ? { modeSetup }
      : {}),
  }
}

const MAX_DECK_NAME_LENGTH = 120

function parseSeatDeck(value: unknown): LanSeatDeck | null {
  if (!isRecord(value) || !isId(value.versionId) || typeof value.name !== "string") return null
  const { startingValue, fingerprint } = value
  return {
    versionId: value.versionId,
    name: value.name.slice(0, MAX_DECK_NAME_LENGTH),
    ...(isCount(startingValue) ? { startingValue } : {}),
    ...(typeof fingerprint === "string" && /^v1:[0-9a-f]{64}$/.test(fingerprint)
      ? { fingerprint }
      : {}),
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
      ...(isId(value.compensatesOperationId)
        ? { compensatesOperationId: asOperationId(value.compensatesOperationId) }
        : {}),
    }
  if (value.type === "table.action" && matchesValidator(tableActionValidator, value.action))
    return {
      type: "table.action",
      ...base,
      action: value.action,
      ...(isId(value.undoOf) ? { undoOf: asOperationId(value.undoOf) } : {}),
    }
  if (
    value.type === "commanderDamage.submitted" &&
    isId(value.fromPlayerId) &&
    isId(value.toPlayerId) &&
    isCommanderSlot(value.commander) &&
    isWhole(value.delta)
  )
    return {
      type: "commanderDamage.submitted",
      ...base,
      fromPlayerId: asPlayerId(value.fromPlayerId),
      toPlayerId: asPlayerId(value.toPlayerId),
      ...commanderField(value.commander),
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
        ? {
            variants: value.variants.filter(
              (variant): variant is string =>
                typeof variant === "string" && CLIENT_VARIANTS.includes(variant),
            ),
          }
        : {}),
      ...(value.editsAnySeat === true ? { editsAnySeat: true } : {}),
      ...(isCount(value.tableVersion) ? { tableVersion: value.tableVersion } : {}),
    }
  if (value.type === "reveal") return { type: "reveal" }
  if (value.type === "log")
    return { type: "log", ...(isId(value.before) ? { before: value.before } : {}) }
  if (value.type === "ping" && isCount(value.at)) return { type: "ping", at: value.at }
  if (value.type === "stats") {
    const stats = parseLatencySummary(value.stats)
    return stats ? { type: "stats", stats } : null
  }
  if (value.type === "deck") {
    const deck = value.deck === null ? null : parseSeatDeck(value.deck)
    return value.deck === null || deck ? { type: "deck", deck } : null
  }
  if (value.type === "op") {
    const event = parseEvent(value.event)
    if (!event) return null
    return isCount(value.tappedAt)
      ? { type: "op", event, tappedAt: value.tappedAt }
      : { type: "op", event }
  }
  return null
}

const LAN_STATUSES: readonly LanStatus[] = ["lobby", "active", "finished", "abandoned"]
const CLAIM_STATUSES: readonly ClaimStatus[] = ["pending", "confirmed", "declined"]

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
      ...(seat.editsAnySeat === true ? { editsAnySeat: true } : {}),
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
    return {
      type: "welcome",
      pass: { key: value.pass.key, token: value.pass.token },
      ...(value.partners === true ? { partners: true } : {}),
      ...(value.editsAnySeat === true ? { editsAnySeat: true } : {}),
      ...(value.turns === true ? { turns: true } : {}),
      ...(value.log === true ? { log: true } : {}),
    }
  if (value.type === "game") return { type: "outdated" }
  if (value.type === "state") {
    const lobby = parseLobby(value.lobby)
    const projection = toConnectedProjection(value.projection)
    return lobby && projection ? { type: "state", lobby, projection } : null
  }
  if (value.type === "ack" && isId(value.operationId)) {
    const status = CLAIM_STATUSES.find((candidate) => candidate === value.status)
    return { type: "ack", operationId: value.operationId, ...(status ? { status } : {}) }
  }
  if (value.type === "nack" && isId(value.operationId) && typeof value.message === "string")
    return {
      type: "nack",
      operationId: value.operationId,
      ...(typeof value.code === "string" ? { code: value.code } : {}),
      message: value.message,
    }
  if (value.type === "pong" && isCount(value.at) && isCount(value.hostAt))
    return { type: "pong", at: value.at, hostAt: value.hostAt }
  if (value.type === "log" && Array.isArray(value.events))
    return {
      type: "log",
      events: value.events.slice(-NEARBY_LOG_LIMIT).flatMap((event) => parseLogEvent(event) ?? []),
      more: value.more === true,
      ...(isId(value.before) ? { before: value.before } : {}),
    }
  return null
}

/** why: a newer host may send actions this build can't read, so a row keeps its change and drops only the action. */
function parseLogEvent(value: unknown): ConnectedLogEvent | null {
  if (!isRecord(value)) return null
  const { operationId, playerId, kind, delta, fromPlayerId, clientCreatedAt, action, undoOf } =
    value
  if (!isId(operationId) || !isId(playerId) || !isId(kind) || !isCount(clientCreatedAt)) return null
  return {
    operationId,
    playerId,
    kind,
    ...(isWhole(delta) ? { delta } : {}),
    ...(isId(fromPlayerId) ? { fromPlayerId } : {}),
    clientCreatedAt,
    ...(matchesValidator(tableActionValidator, action) ? { action } : {}),
    ...(isId(undoOf) ? { undoOf } : {}),
    ...(value.mine === true ? { mine: true as const } : {}),
  }
}

/** why: `more` says older changes wait before the first of `events`; `before` names the change a page was asked to end before. */
export interface LanLogPage {
  events: ConnectedLogEvent[]
  more: boolean
  before?: string
}

/** why: the log rides one line, and a peer drops a line past MAX_LINE_BYTES, so the host sends the newest changes that fit and older ones page in on request. */
export function lanLog(game: LanGame, viewerKey: string, before?: string): LanLogPage {
  const all = [...(game.memory?.events.values() ?? [])]
  const cursor = before === undefined ? {} : { before }
  const end = before === undefined ? all.length : all.findIndex((e) => e.operationId === before)
  if (end < 0) return { events: [], more: false, ...cursor }
  let bytes = encodeLine({ type: "log", events: [], more: true, ...cursor }).length
  const events: ConnectedLogEvent[] = []
  let start = end
  while (start > 0 && events.length < NEARBY_LOG_LIMIT) {
    const event = connectedLogEvent(all[start - 1], viewerKey)
    // why: each event's own newline stands in for the comma that joins it to the next.
    const size = encodeLine(event).length
    if (bytes + size > MAX_LINE_BYTES) break
    bytes += size
    events.unshift(event)
    start -= 1
  }
  return { events, more: start > 0, ...cursor }
}

/** why: the newest page replaces what it repeats and older pages go in front, so a guest keeps every change it has read, in the host's order. */
export function mergeLanLog(
  current: { events: readonly ConnectedLogEvent[]; more?: boolean } | undefined,
  page: LanLogPage,
): { events: ConnectedLogEvent[]; more: boolean } {
  const fresh = new Set(page.events.map(({ operationId }) => operationId))
  const kept = (current?.events ?? []).filter(({ operationId }) => !fresh.has(operationId))
  if (page.before !== undefined) return { events: [...page.events, ...kept], more: page.more }
  return {
    events: [...kept, ...page.events],
    more: kept.length > 0 ? (current?.more ?? false) : page.more,
  }
}
