import { randomUUID as secureRandomUUID } from "expo-crypto"

import type {
  ActorId,
  CommandContext,
  DeviceId,
  GameCommand,
  GameEvent,
  GameId,
  GamePlayer,
  LifeChangedEvent,
  LifeDelta,
  LocalGame,
  NewPlayerInput,
  OperationId,
  PlayerId,
} from "./types"

export const PLAYER_COLORS = ["#B85636", "#41476E", "#39755C", "#94632D", "#77558A", "#A33A52"]
export const LIFE_DELTAS: readonly LifeDelta[] = [-5, -1, 1, 5]
export const STARTING_LIFE_PRESETS = [20, 30, 40] as const
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6
export const MAX_PLAYER_NAME_LENGTH = 24

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

export function validateStartingLife(life: number): boolean {
  return Number.isInteger(life) && life > 0 && life <= 999
}

export function isLifeDelta(value: unknown): value is LifeDelta {
  return LIFE_DELTAS.includes(value as LifeDelta)
}

export function createLocalGame(input: {
  players: NewPlayerInput[]
  startingLife: number
  now?: number
  gameId?: GameId
}): LocalGame {
  if (!validatePlayerCount(input.players.length)) {
    throw new Error("A local game requires 2–6 players.")
  }
  if (!validateStartingLife(input.startingLife)) {
    throw new Error("Starting life must be a whole number from 1 to 999.")
  }
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
    life: input.startingLife,
    seat,
  }))

  return {
    schemaVersion: 1,
    id,
    status: "active",
    startingLife: input.startingLife,
    players,
    events: [],
    createdAt: now,
    updatedAt: now,
  }
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
      const alreadyCompensated = game.events.some(
        (candidate) =>
          candidate.type === "life.changed" &&
          candidate.compensatesOperationId === event.compensatesOperationId,
      )
      if (!target || target.compensatesOperationId || alreadyCompensated) return game
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

  const status = event.type === "game.finished" ? "finished" : "abandoned"
  return {
    ...game,
    status,
    events: [...game.events, event],
    updatedAt: Math.max(game.updatedAt, event.clientCreatedAt),
    finishedAt: event.clientCreatedAt,
  }
}

export function reduceGameEvents(game: LocalGame, events: readonly GameEvent[]): LocalGame {
  return events.reduce(reduceGameEvent, game)
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
  if (command.type === "life.undo") {
    const compensated = new Set(
      game.events.flatMap((event) =>
        event.type === "life.changed" && event.compensatesOperationId
          ? [event.compensatesOperationId]
          : [],
      ),
    )
    const target = game.events.findLast(
      (event): event is LifeChangedEvent =>
        event.type === "life.changed" &&
        !event.compensatesOperationId &&
        event.actorId === context.actorId &&
        !compensated.has(event.operationId),
    )
    return target
      ? {
          ...base,
          type: "life.changed",
          playerId: target.playerId,
          delta: -target.delta as LifeDelta,
          compensatesOperationId: target.operationId,
        }
      : null
  }
  return { ...base, type: command.type === "game.finish" ? "game.finished" : "game.abandoned" }
}

export function applyGameCommand(
  game: LocalGame,
  command: GameCommand,
  context: CommandContext,
): LocalGame {
  const event = commandToEvent(game, command, context)
  return event ? reduceGameEvent(game, event) : game
}

export function canUndo(game: LocalGame, actorId: ActorId): boolean {
  const compensated = new Set(
    game.events.flatMap((event) =>
      event.type === "life.changed" && event.compensatesOperationId
        ? [event.compensatesOperationId]
        : [],
    ),
  )
  return game.events.some(
    (event) =>
      event.type === "life.changed" &&
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
