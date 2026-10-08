import { randomUUID as secureRandomUUID } from "expo-crypto"

import { playerGridLayoutForCount, type PlayerGridLayoutVariant } from "./playerLayouts"
import { isPlaySystemId, playSystemFormat, playSystemRules, type PlaySystemId } from "./playSystems"
import type {
  ActorId,
  CommanderDamageAssignedEvent,
  CommandContext,
  DeviceId,
  GameCommand,
  GameEvent,
  GameId,
  GamePlayer,
  LifeChangedEvent,
  LifeDelta,
  LocalGame,
  LocalGameAccount,
  LocalGameMatch,
  LocalGameResult,
  LocalMatchResult,
  NewPlayerInput,
  OperationId,
  PlayerId,
} from "./types"
import {
  PLAYER_COLOR_CHOICES,
  PLAYER_MARK_SHAPES,
  shapeForSeat,
} from "../../../convex/lib/appearance"
import { MAX_GAMES_PER_MATCH, winsNeeded, type MatchBestOf } from "../../../convex/lib/matchResults"

export const PLAYER_COLORS = PLAYER_COLOR_CHOICES
export const MAX_LIFE_DELTA = 999_999
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
export const MAX_PLAYER_NAME_LENGTH = 24
export const COMMANDER_LETHAL_DAMAGE = 21
export const MAX_COMMANDER_DAMAGE = 99

export function validatePlayerNames(values: readonly string[]): {
  valid: boolean
  names: string[]
  errors: Array<string | undefined>
} {
  const names = values.map((value) => value.trim())
  const duplicateKeys = new Set<string>()
  const counts = new Map<string, number>()
  for (const name of names) {
    if (!name) continue
    const key = name.toLocaleLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [key, count] of counts) if (count > 1) duplicateKeys.add(key)
  const errors = names.map((name) => {
    if (!name) return "Enter a player name."
    if (name.length > MAX_PLAYER_NAME_LENGTH)
      return `Use ${MAX_PLAYER_NAME_LENGTH} characters or fewer.`
    if (duplicateKeys.has(name.toLocaleLowerCase())) return "Player names must be unique."
    return undefined
  })
  return { valid: errors.every((error) => error === undefined), names, errors }
}

export function createClientId(
  prefix: string,
  _now = Date.now(),
  randomUUID: () => string = secureRandomUUID,
): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`
}

export const asGameId = (value: string) => value as GameId
export const asPlayerId = (value: string) => value as PlayerId
export const asOperationId = (value: string) => value as OperationId
export const asActorId = (value: string) => value as ActorId
export const asDeviceId = (value: string) => value as DeviceId

export function validatePlayerCount(count: number): boolean {
  return Number.isInteger(count) && count >= MIN_PLAYERS && count <= MAX_PLAYERS
}

export function validateStartingLife(life: number, system?: PlaySystemId): boolean {
  return (
    Number.isInteger(life) && life > 0 && life <= playSystemRules(system).counter.maxStartingValue
  )
}

export function isLifeDelta(value: unknown): value is LifeDelta {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value !== 0 &&
    Math.abs(value) <= MAX_LIFE_DELTA
  )
}

export function isCommanderDamageDelta(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value !== 0 &&
    Math.abs(value) <= MAX_COMMANDER_DAMAGE
  )
}

export function createLocalGame(input: {
  players: NewPlayerInput[]
  startingLife: number
  system?: PlaySystemId
  format?: string
  layout?: PlayerGridLayoutVariant
  lifeStep?: number
  now?: number
  gameId?: GameId
  account?: { ownerId: string; meSeat?: number; deckVersionId?: string; deckName?: string }
  match?: { bestOf: MatchBestOf }
}): LocalGame {
  const system = isPlaySystemId(input.system) ? input.system : undefined
  const format = system ? playSystemFormat(system, input.format) : undefined
  const counter = playSystemRules(system).counter
  const lifeStep = input.lifeStep ?? counter.tapStep
  if (!validatePlayerCount(input.players.length)) {
    throw new Error("A local game requires 2–6 players.")
  }
  if (!validateStartingLife(input.startingLife, system)) {
    throw new Error(
      `Starting ${counter.label} must be a whole number from 1 to ${counter.maxStartingValue}.`,
    )
  }
  if (!isLifeDelta(lifeStep) || lifeStep < 1)
    throw new Error("Life step must be a positive whole number.")
  const validatedNames = validatePlayerNames(input.players.map(({ name }) => name))
  if (!validatedNames.valid) {
    throw new Error(validatedNames.errors.find(Boolean) ?? "Enter valid player names.")
  }

  const now = input.now ?? Date.now()
  const id = input.gameId ?? asGameId(createClientId("game", now))
  const players: GamePlayer[] = input.players.map((player, seat) => ({
    id: asPlayerId(createClientId("player", now + seat)),
    name: validatedNames.names[seat],
    color: player.color || PLAYER_COLORS[seat],
    shape: player.shape ?? shapeForSeat(seat + 1, PLAYER_MARK_SHAPES),
    life: input.startingLife,
    seat,
  }))

  return {
    schemaVersion: 1,
    id,
    status: "active",
    ...(system ? { system, format } : {}),
    layout: playerGridLayoutForCount(input.players.length, input.layout),
    lifeStep,
    startingLife: input.startingLife,
    players,
    events: [],
    createdAt: now,
    updatedAt: now,
    ...(input.account ? { account: localGameAccount(players, input.account) } : {}),
    ...(input.match ? { match: newMatch(input.match.bestOf, players.length, now) } : {}),
  }
}

function newMatch(bestOf: MatchBestOf, seatCount: number, now: number): LocalGameMatch {
  return {
    id: createClientId("match", now),
    bestOf,
    gameNumber: 1,
    wins: Array.from({ length: seatCount }, () => 0),
    draws: 0,
  }
}

/** why: the score once this game's result is counted, by seat index. */
export function matchScoreAfter(game: Pick<LocalGame, "players" | "match" | "result">) {
  const match = game.match
  if (!match) throw new Error("This game is not part of a match.")
  const result = game.result
  return {
    wins: game.players.map(
      (player, seat) =>
        (match.wins[seat] ?? 0) +
        (result?.kind === "win" && result.winnerPlayerIds.includes(player.id) ? 1 : 0),
    ),
    draws: match.draws + (result?.kind === "draw" ? 1 : 0),
  }
}

/** why: a seat that reaches the needed wins ends the match without asking. */
export function completedMatchResult(
  game: Pick<LocalGame, "players" | "match" | "result">,
): LocalMatchResult | undefined {
  if (!game.match) return undefined
  const { wins } = matchScoreAfter(game)
  const winner = wins.findIndex((count) => count >= winsNeeded(game.match!.bestOf))
  if (winner === -1) return undefined
  return { outcomes: wins.map((_, seat) => (seat === winner ? "win" : "loss")) }
}

export function drawsLabel(draws: number) {
  return `${draws} ${draws === 1 ? "draw" : "draws"}`
}

export function matchScoreLabel(score: { wins: number[]; draws: number }) {
  return score.draws === 0
    ? score.wins.join("-")
    : `${score.wins.join("-")} · ${drawsLabel(score.draws)}`
}

/** why: the board shows where the match stands before this game counts. */
export function matchContextLabel(game: Pick<LocalGame, "match">) {
  const match = game.match
  if (!match) return undefined
  return `Game ${match.gameNumber} · ${matchScoreLabel(match)}`
}

export function canContinueMatch(game: Pick<LocalGame, "status" | "match">) {
  return (
    game.status === "finished" &&
    game.match !== undefined &&
    game.match.result === undefined &&
    game.match.gameNumber < MAX_GAMES_PER_MATCH
  )
}

/** why: the next game keeps the seats and the score; only the board and the game id are new. */
export function createNextMatchGame(game: LocalGame, now?: number): LocalGame {
  if (!game.match || !canContinueMatch(game))
    throw new Error("This match cannot continue to another game.")
  const next = createRematch(game, now)
  return {
    ...next,
    match: {
      ...game.match,
      gameNumber: game.match.gameNumber + 1,
      ...matchScoreAfter(game),
    },
  }
}

/** why: a match counts as under way once a game of it started or finished; a fresh game 1 can still be replaced. */
export function isMatchInProgress(game: LocalGame) {
  return game.match !== undefined && (game.match.gameNumber > 1 || hasLocalGameStarted(game))
}

/** why: abandoning a game mid-match restarts that game; the match and its score stay. */
export function restartMatchGame(game: LocalGame, now?: number): LocalGame {
  if (!game.match) throw new Error("This game is not part of a match.")
  return { ...createRematch(game, now), match: game.match }
}

/** why: setup forms know seats by index while a running game knows them by player id. */
export function localGameAccount(
  players: readonly GamePlayer[],
  account: { ownerId: string; meSeat?: number; deckVersionId?: string; deckName?: string },
): LocalGameAccount {
  const me = account.meSeat === undefined ? undefined : players[account.meSeat]
  return {
    ownerId: account.ownerId,
    ...(me ? { mePlayerId: me.id } : {}),
    ...(me && account.deckVersionId ? { deckVersionId: account.deckVersionId } : {}),
    ...(me && account.deckVersionId && account.deckName ? { deckName: account.deckName } : {}),
  }
}

export function meSeatOf(game: Pick<LocalGame, "players" | "account">): number | undefined {
  const index = game.players.findIndex((player) => player.id === game.account?.mePlayerId)
  return index === -1 ? undefined : index
}

export function createRematch(game: LocalGame, now?: number): LocalGame {
  return createLocalGame({
    players: game.players.map(({ name, color, shape }) => ({ name, color, shape })),
    startingLife: game.startingLife,
    system: game.system,
    format: game.format,
    layout: game.layout,
    lifeStep: game.lifeStep,
    now,
    ...(game.account ? { account: { ...game.account, meSeat: meSeatOf(game) } } : {}),
    // why: match mode is a table setting, so a finished match hands the table a fresh match.
    ...(game.match ? { match: { bestOf: game.match.bestOf } } : {}),
  })
}

export const commanderDamageKey = (fromPlayerId: PlayerId, toPlayerId: PlayerId): string =>
  `${fromPlayerId}>${toPlayerId}`

export function commanderDamageBetween(
  game: LocalGame,
  fromPlayerId: PlayerId,
  toPlayerId: PlayerId,
): number {
  return game.commanderDamage?.[commanderDamageKey(fromPlayerId, toPlayerId)] ?? 0
}

export function incomingCommanderDamage(
  game: LocalGame,
  toPlayerId: PlayerId,
): Record<PlayerId, number> {
  const incoming = {} as Record<PlayerId, number>
  for (const player of game.players) {
    if (player.id === toPlayerId) continue
    incoming[player.id] = commanderDamageBetween(game, player.id, toPlayerId)
  }
  return incoming
}

export function isEliminatedByCommanderDamage(game: LocalGame, playerId: PlayerId): boolean {
  return game.players.some(
    (player) =>
      player.id !== playerId &&
      commanderDamageBetween(game, player.id, playerId) >= COMMANDER_LETHAL_DAMAGE,
  )
}

type CompensatableEvent = LifeChangedEvent | CommanderDamageAssignedEvent

function isCompensatable(event: GameEvent): event is CompensatableEvent {
  return event.type === "life.changed" || event.type === "commanderDamage.assigned"
}

function compensatedOperationIds(game: LocalGame): Set<OperationId> {
  return new Set(
    game.events.flatMap((event) =>
      isCompensatable(event) && event.compensatesOperationId ? [event.compensatesOperationId] : [],
    ),
  )
}

export function reduceGameEvent(game: LocalGame, event: GameEvent): LocalGame {
  if (
    event.gameId !== game.id ||
    game.events.some(({ operationId }) => operationId === event.operationId)
  ) {
    return game
  }
  if (game.status !== "active") return game

  if (event.type === "life.changed") {
    if (!isLifeDelta(event.delta)) return game
    const playerIndex = game.players.findIndex(({ id }) => id === event.playerId)
    if (playerIndex < 0) return game
    if (event.compensatesOperationId) {
      const target = game.events.find(
        (candidate): candidate is LifeChangedEvent =>
          candidate.type === "life.changed" &&
          candidate.operationId === event.compensatesOperationId &&
          candidate.playerId === event.playerId &&
          candidate.delta === -event.delta,
      )
      if (
        !target ||
        target.compensatesOperationId ||
        compensatedOperationIds(game).has(event.compensatesOperationId)
      )
        return game
    }

    const players = game.players.map((player, index) =>
      index === playerIndex ? { ...player, life: player.life + event.delta } : player,
    )
    return {
      ...game,
      players,
      events: [...game.events, event],
      updatedAt: Math.max(game.updatedAt, event.clientCreatedAt),
    }
  }

  if (event.type === "commanderDamage.assigned") {
    if (event.fromPlayerId === event.toPlayerId) return game
    if (!Number.isInteger(event.delta) || event.delta === 0) return game
    const source = game.players.some(({ id }) => id === event.fromPlayerId)
    const targetIndex = game.players.findIndex(({ id }) => id === event.toPlayerId)
    if (!source || targetIndex < 0) return game
    if (event.compensatesOperationId) {
      const compensated = game.events.find(
        (candidate): candidate is CommanderDamageAssignedEvent =>
          candidate.type === "commanderDamage.assigned" &&
          candidate.operationId === event.compensatesOperationId &&
          candidate.fromPlayerId === event.fromPlayerId &&
          candidate.toPlayerId === event.toPlayerId &&
          candidate.delta === -event.delta,
      )
      if (
        !compensated ||
        compensated.compensatesOperationId ||
        compensatedOperationIds(game).has(event.compensatesOperationId)
      )
        return game
    }

    const key = commanderDamageKey(event.fromPlayerId, event.toPlayerId)
    const total = (game.commanderDamage?.[key] ?? 0) + event.delta
    if (total < 0 || total > MAX_COMMANDER_DAMAGE) return game

    const players = game.players.map((player, index) =>
      index === targetIndex ? { ...player, life: player.life - event.delta } : player,
    )
    return {
      ...game,
      players,
      commanderDamage: { ...game.commanderDamage, [key]: total },
      events: [...game.events, event],
      updatedAt: Math.max(game.updatedAt, event.clientCreatedAt),
    }
  }

  const status = event.type === "game.finished" ? "finished" : "abandoned"
  const result = event.type === "game.finished" ? sanitizeGameResult(game, event.result) : undefined
  const finished: LocalGame = {
    ...game,
    status,
    events: [...game.events, event],
    updatedAt: Math.max(game.updatedAt, event.clientCreatedAt),
    finishedAt: event.clientCreatedAt,
    ...(result ? { result } : {}),
  }
  const matchResult = status === "finished" ? completedMatchResult(finished) : undefined
  return matchResult
    ? { ...finished, match: { ...finished.match!, result: matchResult } }
    : finished
}

export function sanitizeGameResult(
  game: LocalGame,
  result: LocalGameResult | undefined,
): LocalGameResult | undefined {
  if (!result) return undefined
  if (result.kind === "draw") return { kind: "draw" }
  const playerIds = new Set(game.players.map(({ id }) => id))
  const winnerPlayerIds = [...new Set(result.winnerPlayerIds)].filter((id) => playerIds.has(id))
  return winnerPlayerIds.length > 0 ? { kind: "win", winnerPlayerIds } : undefined
}

export function commandToEvent(
  game: LocalGame,
  command: GameCommand,
  context: CommandContext,
): GameEvent | null {
  if (game.status !== "active") return null
  const base = {
    operationId: context.operationId(),
    gameId: game.id,
    actorId: context.actorId,
    deviceId: context.deviceId,
    clientCreatedAt: context.now(),
  }

  if (command.type === "life.change") {
    if (!isLifeDelta(command.delta) || !game.players.some(({ id }) => id === command.playerId)) {
      return null
    }
    return { ...base, type: "life.changed", playerId: command.playerId, delta: command.delta }
  }
  if (command.type === "commanderDamage.assign") {
    const { fromPlayerId, toPlayerId } = command
    if (fromPlayerId === toPlayerId) return null
    if (!Number.isInteger(command.delta) || command.delta === 0) return null
    if (
      !game.players.some(({ id }) => id === fromPlayerId) ||
      !game.players.some(({ id }) => id === toPlayerId)
    )
      return null
    const current = commanderDamageBetween(game, fromPlayerId, toPlayerId)
    const clamped = Math.max(0, Math.min(MAX_COMMANDER_DAMAGE, current + command.delta))
    const delta = clamped - current
    if (delta === 0) return null
    return { ...base, type: "commanderDamage.assigned", fromPlayerId, toPlayerId, delta }
  }
  if (command.type === "life.undo") {
    const compensated = compensatedOperationIds(game)
    const target = game.events.findLast(
      (event): event is CompensatableEvent =>
        isCompensatable(event) &&
        !event.compensatesOperationId &&
        event.actorId === context.actorId &&
        !compensated.has(event.operationId),
    )
    if (!target) return null
    if (target.type === "commanderDamage.assigned")
      return {
        ...base,
        type: "commanderDamage.assigned",
        fromPlayerId: target.fromPlayerId,
        toPlayerId: target.toPlayerId,
        delta: -target.delta,
        compensatesOperationId: target.operationId,
      }
    return {
      ...base,
      type: "life.changed",
      playerId: target.playerId,
      delta: -target.delta as LifeDelta,
      compensatesOperationId: target.operationId,
    }
  }
  if (command.type === "game.finish") {
    const result = sanitizeGameResult(game, command.result)
    return { ...base, type: "game.finished", ...(result ? { result } : {}) }
  }
  return { ...base, type: "game.abandoned" }
}

export function applyGameCommand(
  game: LocalGame,
  command: GameCommand,
  context: CommandContext,
): LocalGame {
  const event = commandToEvent(game, command, context)
  return event ? reduceGameEvent(game, event) : game
}

export function hasLocalGameStarted(game: LocalGame): boolean {
  return (
    game.events.length > 0 ||
    game.players.some((player) => player.life !== game.startingLife) ||
    Object.values(game.commanderDamage ?? {}).some((damage) => damage !== 0)
  )
}

export function canUndo(game: LocalGame, actorId: ActorId): boolean {
  const compensated = compensatedOperationIds(game)
  return game.events.some(
    (event) =>
      isCompensatable(event) &&
      !event.compensatesOperationId &&
      event.actorId === actorId &&
      !compensated.has(event.operationId),
  )
}

export function defaultCommandContext(deviceId: DeviceId): CommandContext {
  return {
    actorId: asActorId(`actor_${deviceId}`),
    deviceId,
    now: Date.now,
    operationId: () => asOperationId(createClientId("operation")),
  }
}
