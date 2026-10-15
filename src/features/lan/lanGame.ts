import { PLAYER_COLOR_CHOICES, shapeForSeat } from "../../../convex/lib/appearance"
import {
  commanderClaimOutcome,
  confirmCommanderClaim,
  isCommanderDamageDelta,
  isCommanderLethal,
  MAX_COMMANDER_DAMAGE,
  MAX_LIFE_DELTA,
  MAX_PENDING_COMMANDER_CLAIMS,
} from "../../../convex/lib/gameRules"
import { EMPTY_TABLE } from "../../../convex/lib/table"
import type { ConnectedDisplayProjection } from "../connected/model"
import { MAX_PLAYER_NAME_LENGTH, MAX_PLAYERS } from "../game/domain"

export const LAN_MAX_SEATS = MAX_PLAYERS
export const LAN_MIN_PLAYERS = 2
// why: the same bound Convex puts on a life delta; a total outside it can only come from a broken or hostile peer.
export const MAX_LAN_LIFE = MAX_LIFE_DELTA
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

export type LanFormat = "standard" | "commander"

export interface LanCommanderClaim {
  id: string
  from: string
  to: string
  delta: number
}

export interface LanCommanderDamage {
  totals: { from: string; to: string; total: number }[]
  claims: LanCommanderClaim[]
  // why: each attacker numbers its claims, so a claim replayed after a reconnect is recognized however long ago it settled.
  sequences: { key: string; seq: number }[]
}

export type LanClaimRequest = { id: string; to: string; delta: number; round: number; seq: number }

export interface LanGame {
  id: string
  hostKey: string
  status: "lobby" | "active" | "finished" | "abandoned"
  // why: each start resets every life, so a total from an earlier round must never win against it.
  round: number
  startingLife: number
  format?: LanFormat
  commander?: LanCommanderDamage
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
  | { type: "join"; name: string; pass?: LanSeatPass; life?: LanLife }
  | ({ type: "life" } & LanLife)
  | ({ type: "commander.claim" } & LanClaimRequest)
  | { type: "commander.resolve"; id: string; accepted: boolean; life?: LanLife }

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

// why: the host's seat has no token anywhere, so no pass can ever claim it; a pass for a seat the lobby already freed just gets a new one.
export function admitLanGuest(
  game: LanGame,
  tokens: ReadonlyMap<string, string>,
  join: Extract<LanGuestMessage, { type: "join" }>,
  fresh: LanSeatPass,
): { game: LanGame; pass: LanSeatPass } | { rejected: string } {
  const { pass } = join
  const owned = pass && game.seats.some((seat) => seat.key === pass.key)
  if (pass && (pass.key === game.hostKey || (owned && tokens.get(pass.key) !== pass.token)))
    return { rejected: "That seat belongs to another device." }
  if (pass && owned)
    return {
      game: withSeat(game, pass.key, (seat) =>
        applyLife(game, { ...seat, name: join.name, connected: true }, join.life),
      ),
      pass,
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

export function startLanGame(
  game: LanGame,
  startingLife: number,
  format: LanFormat = "standard",
): LanGame {
  const { commander: _previous, ...rest } = game
  return {
    ...rest,
    status: "active",
    round: game.round + 1,
    startingLife,
    format,
    ...(format === "commander" ? { commander: { totals: [], claims: [], sequences: [] } } : {}),
    seats: game.seats.map((seat) => ({ ...seat, life: startingLife, version: 0 })),
  }
}

const commanderTotal = (commander: LanCommanderDamage, from: string, to: string) =>
  commander.totals.find((total) => total.from === from && total.to === to)?.total ?? 0

export const lastClaimSeq = (game: LanGame, key: string) =>
  game.commander?.sequences.find((entry) => entry.key === key)?.seq ?? 0

// why: the same decision Convex makes, so a claim that could never land is dropped on arrival instead of waiting on the defender.
export function claimLanCommanderDamage(
  game: LanGame,
  from: string,
  claim: LanClaimRequest,
): LanGame {
  const { commander } = game
  const seated = (key: string) => game.seats.some((seat) => seat.key === key)
  if (
    !commander ||
    game.status !== "active" ||
    claim.round !== game.round ||
    from === claim.to ||
    !seated(from) ||
    !seated(claim.to) ||
    !isCommanderDamageDelta(claim.delta) ||
    claim.seq <= lastClaimSeq(game, from) ||
    commander.claims.some((existing) => existing.id === claim.id)
  )
    return game
  const sequences = [
    ...commander.sequences.filter((entry) => entry.key !== from),
    { key: from, seq: claim.seq },
  ]
  const outcome = commanderClaimOutcome({
    total: commanderTotal(commander, from, claim.to),
    delta: claim.delta,
    pendingClaims: commander.claims.length,
    pairHasPendingClaim: commander.claims.some(
      (existing) => existing.from === from && existing.to === claim.to,
    ),
  })
  if (outcome === "declined") return { ...game, commander: { ...commander, sequences } }
  const { id, to, delta } = claim
  return {
    ...game,
    commander: { ...commander, sequences, claims: [...commander.claims, { id, from, to, delta }] },
  }
}

// why: confirming writes the defender's life, and only the defender may resolve, so its seat still has a single writer.
export function resolveLanCommanderClaim(
  game: LanGame,
  defender: string,
  resolution: { id: string; accepted: boolean },
): LanGame {
  const { commander } = game
  const claim = commander?.claims.find(
    (candidate) => candidate.id === resolution.id && candidate.to === defender,
  )
  const seat = game.seats.find((candidate) => candidate.key === defender)
  if (!commander || !claim || !seat || game.status !== "active") return game
  const claims = commander.claims.filter((candidate) => candidate !== claim)
  const confirmed = resolution.accepted
    ? confirmCommanderClaim({
        total: commanderTotal(commander, claim.from, claim.to),
        life: seat.life,
        delta: claim.delta,
      })
    : null
  if (!confirmed) return { ...game, commander: { ...commander, claims } }
  const totals = [
    ...commander.totals.filter((total) => !(total.from === claim.from && total.to === claim.to)),
    { from: claim.from, to: claim.to, total: confirmed.total },
  ]
  return {
    ...withSeat(game, defender, (owned) => ({
      ...owned,
      life: confirmed.currentLife,
      version: owned.version + 1,
    })),
    commander: { ...commander, totals, claims },
  }
}

// why: a guest's resolve carries the life it already applied, so a resolve replayed after a reconnect updates the totals without taking the damage twice.
export function resolveLanGuestCommanderClaim(
  game: LanGame,
  defender: string,
  resolution: Extract<LanGuestMessage, { type: "commander.resolve" }>,
): LanGame {
  const resolved = resolveLanCommanderClaim(game, defender, resolution)
  if (!resolution.life || resolved === game) return resolved
  return setLanLife({ ...resolved, seats: game.seats }, defender, resolution.life)
}

// why: a host snapshot sent before the guest's latest changes arrived would otherwise roll its life back and offer a claim it already resolved.
export function mergeHostGame(
  hostGame: LanGame,
  key: string,
  own: LanLife | undefined,
  resolvedClaims: ReadonlySet<string> = new Set(),
) {
  const { commander } = hostGame
  const game = commander?.claims.some((claim) => resolvedClaims.has(claim.id))
    ? {
        ...hostGame,
        commander: {
          ...commander,
          claims: commander.claims.filter((claim) => !resolvedClaims.has(claim.id)),
        },
      }
    : hostGame
  return own ? setLanLife(game, key, own) : game
}

const commanderEliminated = (commander: LanCommanderDamage, key: string) =>
  commander.totals.some((total) => total.to === key && isCommanderLethal(total.total))

// why: like Convex, only the defender sees a claim waiting on it.
function commanderProjection(commander: LanCommanderDamage, seatKey: string) {
  return {
    totals: commander.totals.map(({ from, to, total }) => ({
      fromPlayerId: from,
      toPlayerId: to,
      total,
    })),
    pendingClaims: commander.claims
      .filter((claim) => claim.to === seatKey)
      .map((claim) => ({
        claimId: claim.id,
        operationId: claim.id,
        fromPlayerId: claim.from,
        toPlayerId: claim.to,
        delta: claim.delta,
        clientCreatedAt: 0,
        createdAt: 0,
      })),
    eliminatedPlayerIds: [
      ...new Set(
        commander.totals.filter((total) => isCommanderLethal(total.total)).map((total) => total.to),
      ),
    ],
  }
}

export function lanProjection(game: LanGame, seatKey: string): ConnectedDisplayProjection {
  return {
    schemaVersion: 1,
    publicId: game.id,
    status: game.status,
    playerCount: game.seats.length,
    system: "mtg",
    ...(game.format === "commander" ? { format: "commander" } : {}),
    startingLife: game.startingLife,
    ruleset: game.format === "commander" ? "commander" : "lan",
    ...(game.commander ? { commanderDamage: commanderProjection(game.commander, seatKey) } : {}),
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
      ...(game.commander
        ? { eliminatedByCommanderDamage: commanderEliminated(game.commander, seat.key) }
        : {}),
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

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 64

const isCommander = (value: unknown): value is LanCommanderDamage =>
  isRecord(value) &&
  Array.isArray(value.totals) &&
  value.totals.length <= LAN_MAX_SEATS * LAN_MAX_SEATS &&
  value.totals.every(
    (total) =>
      isRecord(total) &&
      isId(total.from) &&
      isId(total.to) &&
      isCount(total.total) &&
      total.total <= MAX_COMMANDER_DAMAGE,
  ) &&
  Array.isArray(value.claims) &&
  value.claims.length <= MAX_PENDING_COMMANDER_CLAIMS &&
  value.claims.every(
    (claim) =>
      isRecord(claim) &&
      isId(claim.id) &&
      isId(claim.from) &&
      isId(claim.to) &&
      isCommanderDamageDelta(claim.delta),
  ) &&
  Array.isArray(value.sequences) &&
  value.sequences.length <= LAN_MAX_SEATS &&
  value.sequences.every((entry) => isRecord(entry) && isId(entry.key) && isCount(entry.seq))

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
  if (
    value.type === "commander.claim" &&
    isId(value.id) &&
    isId(value.to) &&
    isCommanderDamageDelta(value.delta) &&
    isCount(value.round) &&
    isCount(value.seq)
  )
    return {
      type: "commander.claim",
      id: value.id,
      to: value.to,
      delta: value.delta,
      round: value.round,
      seq: value.seq,
    }
  if (
    value.type === "commander.resolve" &&
    isId(value.id) &&
    typeof value.accepted === "boolean" &&
    (value.life === undefined || isLife(value.life))
  )
    return {
      type: "commander.resolve",
      id: value.id,
      accepted: value.accepted,
      ...(value.life
        ? { life: { life: value.life.life, version: value.life.version, round: value.life.round } }
        : {}),
    }
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
  (value.format === undefined || value.format === "standard" || value.format === "commander") &&
  (value.commander === undefined || isCommander(value.commander)) &&
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
