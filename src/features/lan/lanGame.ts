import { PLAYER_COLOR_CHOICES, shapeForSeat } from "../../../convex/lib/appearance"
import { EMPTY_TABLE } from "../../../convex/lib/table"
import type { ConnectedDisplayProjection } from "../connected/model"

export const LAN_MAX_SEATS = 8

export interface LanSeat {
  playerId: string
  seat: number
  name: string
  life: number
  // why: replays and reconnects resend old totals; the higher version always wins.
  version: number
  connected: boolean
}

export interface LanGame {
  id: string
  hostId: string
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

export type LanGuestMessage =
  { type: "join"; playerId: string; name: string; life?: LanLife } | ({ type: "life" } & LanLife)

export type LanHostMessage = { type: "game"; game: LanGame } | { type: "rejected"; reason: string }

export function createLanGame(id: string, host: { playerId: string; name: string }): LanGame {
  const startingLife = 20
  return {
    id,
    hostId: host.playerId,
    status: "lobby",
    round: 0,
    startingLife,
    seats: [
      {
        playerId: host.playerId,
        seat: 1,
        name: host.name,
        life: startingLife,
        version: 0,
        connected: true,
      },
    ],
  }
}

const withSeat = (game: LanGame, playerId: string, update: (seat: LanSeat) => LanSeat) => ({
  ...game,
  seats: game.seats.map((seat) => (seat.playerId === playerId ? update(seat) : seat)),
})

const applyLife = (game: LanGame, seat: LanSeat, life: LanLife | undefined): LanSeat =>
  life && life.round === game.round && life.version > seat.version
    ? { ...seat, life: life.life, version: life.version }
    : seat

export function joinLanGame(
  game: LanGame,
  join: Extract<LanGuestMessage, { type: "join" }>,
): LanGame | { rejected: string } {
  if (game.seats.some((seat) => seat.playerId === join.playerId))
    return withSeat(game, join.playerId, (seat) =>
      applyLife(game, { ...seat, name: join.name, connected: true }, join.life),
    )
  if (game.status !== "lobby") return { rejected: "This game has already started." }
  if (game.seats.length >= LAN_MAX_SEATS) return { rejected: "This game is full." }
  return {
    ...game,
    seats: [
      ...game.seats,
      {
        playerId: join.playerId,
        seat: game.seats.length + 1,
        name: join.name,
        life: game.startingLife,
        version: 0,
        connected: true,
      },
    ],
  }
}

export const setLanLife = (game: LanGame, playerId: string, life: LanLife) =>
  withSeat(game, playerId, (seat) => applyLife(game, seat, life))

export const setLanConnected = (game: LanGame, playerId: string, connected: boolean) =>
  withSeat(game, playerId, (seat) => ({ ...seat, connected }))

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
export function mergeHostGame(hostGame: LanGame, playerId: string, own: LanLife | undefined) {
  return own ? setLanLife(hostGame, playerId, own) : hostGame
}

export function lanProjection(game: LanGame, playerId: string): ConnectedDisplayProjection {
  return {
    schemaVersion: 1,
    publicId: game.id,
    status: game.status,
    playerCount: game.seats.length,
    system: "mtg",
    startingLife: game.startingLife,
    ruleset: "lan",
    isHost: game.hostId === playerId,
    eventSequence: 0,
    serverUpdatedAt: 0,
    recentOperationIds: [],
    table: EMPTY_TABLE,
    players: game.seats.map((seat) => ({
      playerId: seat.playerId,
      seat: seat.seat,
      displayName: seat.name,
      color: PLAYER_COLOR_CHOICES[(seat.seat - 1) % PLAYER_COLOR_CHOICES.length],
      shape: shapeForSeat(seat.seat),
      currentLife: seat.life,
      controlledByMe: seat.playerId === playerId,
      pendingDelta: 0,
    })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const isLife = (value: unknown): value is LanLife =>
  isRecord(value) &&
  Number.isInteger(value.life) &&
  Number.isInteger(value.version) &&
  Number.isInteger(value.round)

export function parseGuestMessage(line: string): LanGuestMessage | null {
  const value: unknown = JSON.parse(line)
  if (!isRecord(value)) return null
  if (
    value.type === "join" &&
    typeof value.playerId === "string" &&
    typeof value.name === "string" &&
    (value.life === undefined || isLife(value.life))
  )
    return {
      type: "join",
      playerId: value.playerId,
      name: value.name.slice(0, 40),
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
  Number.isInteger(value.life) &&
  Number.isInteger(value.version) &&
  typeof value.playerId === "string" &&
  Number.isInteger(value.seat) &&
  typeof value.name === "string" &&
  typeof value.connected === "boolean"

const isGame = (value: unknown): value is LanGame =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.hostId === "string" &&
  LAN_STATUSES.some((status) => status === value.status) &&
  Number.isInteger(value.round) &&
  Number.isInteger(value.startingLife) &&
  Array.isArray(value.seats) &&
  value.seats.every(isSeat)

export function parseHostMessage(line: string): LanHostMessage | null {
  const value: unknown = JSON.parse(line)
  if (!isRecord(value)) return null
  if (value.type === "rejected" && typeof value.reason === "string")
    return { type: "rejected", reason: value.reason }
  if (value.type === "game" && isGame(value.game)) return { type: "game", game: value.game }
  return null
}
