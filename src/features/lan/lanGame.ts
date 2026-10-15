import { PLAYER_COLOR_CHOICES, shapeForSeat } from "../../../convex/lib/appearance"
import { EMPTY_TABLE } from "../../../convex/lib/table"
import type { ConnectedDisplayProjection } from "../connected/model"
import { MAX_PLAYER_NAME_LENGTH, MAX_PLAYERS } from "../game/domain"

export const LAN_MAX_SEATS = MAX_PLAYERS
export const LAN_MIN_PLAYERS = 2
// why: the same bound Convex puts on a life delta; a total outside it can only come from a broken or hostile peer.
export const MAX_LAN_LIFE = 999_999
// why: a guest offline for a long game still catches up, but one message can't jump a version so far the seat locks.
export const MAX_LAN_VERSION_STEP = 10_000

export const connectedSeatCount = (game: LanGame) =>
  game.seats.filter((seat) => seat.connected).length

export interface LanSeat {
  key: string
  seat: number
  name: string
  life: number
  // why: replays and reconnects resend old totals; the higher version always wins.
  version: number
  connected: boolean
}

export interface LanGame {
  id: string
  hostKey: string
  status: "lobby" | "active" | "finished" | "abandoned"
  // why: each start resets every life, so a total from an earlier round must never win against it.
  round: number
  startingLife: number
  seats: LanSeat[]
}

export interface LanLife {
  life: number
  version: number
  round: number
}

// why: seat keys are public in every snapshot, so reclaiming a seat also needs the token only its device was sent.
export interface LanSeatPass {
  key: string
  token: string
}

export type LanGuestMessage =
  { type: "join"; name: string; pass?: LanSeatPass; life?: LanLife } | ({ type: "life" } & LanLife)

export type LanHostMessage =
  | { type: "game"; game: LanGame }
  | { type: "welcome"; pass: LanSeatPass }
  | { type: "rejected"; reason: string }

export function createLanGame(id: string, hostKey: string, name: string): LanGame {
  const startingLife = 20
  return {
    id,
    hostKey,
    status: "lobby",
    round: 0,
    startingLife,
    seats: [{ key: hostKey, seat: 1, name, life: startingLife, version: 0, connected: true }],
  }
}

const withSeat = (game: LanGame, key: string, update: (seat: LanSeat) => LanSeat) => ({
  ...game,
  seats: game.seats.map((seat) => (seat.key === key ? update(seat) : seat)),
})

const applyLife = (game: LanGame, seat: LanSeat, life: LanLife | undefined): LanSeat =>
  life &&
  life.round === game.round &&
  life.version > seat.version &&
  life.version - seat.version <= MAX_LAN_VERSION_STEP
    ? { ...seat, life: life.life, version: life.version }
    : seat

// why: the host's seat has no token anywhere, so no pass can ever claim it; new seats only exist while in the lobby.
export function admitLanGuest(
  game: LanGame,
  tokens: ReadonlyMap<string, string>,
  join: Extract<LanGuestMessage, { type: "join" }>,
  fresh: LanSeatPass,
): { game: LanGame; pass: LanSeatPass } | { rejected: string } {
  const { pass } = join
  if (pass) {
    const owned = game.seats.some((seat) => seat.key === pass.key)
    if (!owned || pass.key === game.hostKey || tokens.get(pass.key) !== pass.token)
      return { rejected: "That seat belongs to another device." }
    return {
      game: withSeat(game, pass.key, (seat) =>
        applyLife(game, { ...seat, name: join.name, connected: true }, join.life),
      ),
      pass,
    }
  }
  if (game.status !== "lobby") return { rejected: "This game has already started." }
  if (game.seats.length >= LAN_MAX_SEATS) return { rejected: "This game is full." }
  const seat: LanSeat = {
    key: fresh.key,
    seat: game.seats.length + 1,
    name: join.name,
    life: game.startingLife,
    version: 0,
    connected: true,
  }
  return { game: { ...game, seats: [...game.seats, seat] }, pass: fresh }
}

export const setLanLife = (game: LanGame, key: string, life: LanLife) =>
  withSeat(game, key, (seat) => applyLife(game, seat, life))

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

export function startLanGame(game: LanGame, startingLife: number): LanGame {
  return {
    ...game,
    status: "active",
    round: game.round + 1,
    startingLife,
    seats: game.seats.map((seat) => ({ ...seat, life: startingLife, version: 0 })),
  }
}

// why: a host snapshot sent before the guest's latest change arrived would otherwise roll its life back.
export function mergeHostGame(hostGame: LanGame, key: string, own: LanLife | undefined) {
  return own ? setLanLife(hostGame, key, own) : hostGame
}

export function lanProjection(game: LanGame, seatKey: string): ConnectedDisplayProjection {
  return {
    schemaVersion: 1,
    publicId: game.id,
    status: game.status,
    playerCount: game.seats.length,
    system: "mtg",
    startingLife: game.startingLife,
    ruleset: "lan",
    isHost: game.hostKey === seatKey,
    eventSequence: 0,
    serverUpdatedAt: 0,
    recentOperationIds: [],
    table: EMPTY_TABLE,
    players: game.seats.map((seat) => ({
      playerId: seat.key,
      seat: seat.seat,
      displayName: seat.name,
      color: PLAYER_COLOR_CHOICES[(seat.seat - 1) % PLAYER_COLOR_CHOICES.length],
      shape: shapeForSeat(seat.seat),
      currentLife: seat.life,
      controlledByMe: seat.key === seatKey,
      pendingDelta: 0,
    })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const isLifeTotal = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= MAX_LAN_LIFE

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0

const isLife = (value: unknown): value is LanLife =>
  isRecord(value) && isLifeTotal(value.life) && isCount(value.version) && isCount(value.round)

const isPass = (value: unknown): value is LanSeatPass =>
  isRecord(value) &&
  typeof value.key === "string" &&
  value.key.length <= 64 &&
  typeof value.token === "string" &&
  value.token.length <= 128

export function parseGuestMessage(line: string): LanGuestMessage | null {
  const value: unknown = JSON.parse(line)
  if (!isRecord(value)) return null
  if (
    value.type === "join" &&
    typeof value.name === "string" &&
    (value.pass === undefined || isPass(value.pass)) &&
    (value.life === undefined || isLife(value.life))
  )
    return {
      type: "join",
      name: value.name.slice(0, MAX_PLAYER_NAME_LENGTH),
      ...(value.pass ? { pass: { key: value.pass.key, token: value.pass.token } } : {}),
      ...(value.life
        ? { life: { life: value.life.life, version: value.life.version, round: value.life.round } }
        : {}),
    }
  if (value.type === "life" && isLife(value))
    return { type: "life", life: value.life, version: value.version, round: value.round }
  return null
}

const LAN_STATUSES: readonly LanGame["status"][] = ["lobby", "active", "finished", "abandoned"]

const isSeat = (value: unknown): value is LanSeat =>
  isRecord(value) &&
  typeof value.key === "string" &&
  Number.isInteger(value.seat) &&
  typeof value.name === "string" &&
  isLifeTotal(value.life) &&
  isCount(value.version) &&
  typeof value.connected === "boolean"

const isGame = (value: unknown): value is LanGame =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.hostKey === "string" &&
  LAN_STATUSES.some((status) => status === value.status) &&
  isCount(value.round) &&
  Number.isInteger(value.startingLife) &&
  Array.isArray(value.seats) &&
  value.seats.length <= LAN_MAX_SEATS &&
  value.seats.every(isSeat)

export function parseHostMessage(line: string): LanHostMessage | null {
  const value: unknown = JSON.parse(line)
  if (!isRecord(value)) return null
  if (value.type === "rejected" && typeof value.reason === "string")
    return { type: "rejected", reason: value.reason }
  if (value.type === "welcome" && isPass(value.pass))
    return { type: "welcome", pass: { key: value.pass.key, token: value.pass.token } }
  if (value.type === "game" && isGame(value.game)) return { type: "game", game: value.game }
  return null
}
