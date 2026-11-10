import type { Href } from "expo-router"

import {
  applyGameCommand,
  applyLocalTableAction,
  commanderDamageBetween,
  createClientId,
  createLocalGame,
  defaultCommandContext,
  MAX_COMMANDER_DAMAGE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  withFirstTurn,
} from "@/features/game/domain"
import {
  DEFAULT_LOCAL_SETTINGS,
  localGameRepository,
  type LocalGameRepository,
} from "@/features/game/localPersistence"
import { getPlayerGridLayoutOptions } from "@/features/game/playerLayouts"
import {
  defaultStartingLife,
  isPlaySystemId,
  NO_PLAY_SYSTEM,
  PLAY_SYSTEM_IDS,
  playSystemFormats,
  playTableRules,
  supportsCommanderDamage,
} from "@/features/game/playSystems"
import type { LocalGame } from "@/features/game/types"

import { SeedError, type SeedParams } from "./seedTypes"
import { isPlayerMarkShape } from "../../../convex/lib/appearance"
import type { TableAction } from "../../../convex/lib/table"
import { isValidTurnGroups } from "../../../convex/lib/turns"
import { defaultTeamLife } from "../../../convex/lib/twoHeadedGiant"

function integer(name: string, value: string): number {
  const parsed = Number(value)
  if (!/^-?\d+$/.test(value.trim()) || !Number.isSafeInteger(parsed))
    throw new SeedError(`${name} must be a whole number, got "${value}".`)
  return parsed
}

function list(value: string | undefined): string[] {
  return value ? value.split(",").map((part) => part.trim()) : []
}

function parseSystem(value = "mtg") {
  if (value === NO_PLAY_SYSTEM) return undefined
  if (isPlaySystemId(value)) return value
  throw new SeedError(`system must be one of ${[...PLAY_SYSTEM_IDS, NO_PLAY_SYSTEM].join(", ")}.`)
}

export function buildSeededGame(params: SeedParams, repository: LocalGameRepository): LocalGame {
  const system = parseSystem(params.system)
  if (params.format !== undefined) {
    if (!system) throw new SeedError("format needs a system.")
    const formats = playSystemFormats(system).map(({ id }) => id)
    if (!formats.includes(params.format))
      throw new SeedError(`format for ${system} must be one of ${formats.join(", ")}.`)
  }
  const format = params.format

  const life = list(params.life).map((value) => integer("life", value))
  const playerCount =
    params.players !== undefined
      ? integer("players", params.players)
      : life.length || DEFAULT_LOCAL_SETTINGS.defaultPlayerCount
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS)
    throw new SeedError(`players must be ${MIN_PLAYERS}-${MAX_PLAYERS}.`)
  if (life.length > 0 && life.length !== playerCount)
    throw new SeedError(`life lists ${life.length} values for ${playerCount} players.`)

  const marks = list(params.marks).map((value) => {
    if (!isPlayerMarkShape(value)) throw new SeedError(`marks has an unknown mark "${value}".`)
    return value
  })
  if (marks.length > playerCount)
    throw new SeedError(`marks lists ${marks.length} marks for ${playerCount} players.`)

  const layouts = getPlayerGridLayoutOptions(playerCount).map(({ variant }) => variant)
  const layout = layouts.find((variant) => variant === (params.layout ?? "auto"))
  if (!layout)
    throw new SeedError(`layout for ${playerCount} players must be one of ${layouts.join(", ")}.`)

  const names = list(params.names)
  const teams = list(params.teams).map((entry) =>
    entry.split("+").map((value) => integer("teams seat", value) - 1),
  )
  let game: LocalGame
  try {
    game = createLocalGame({
      players: Array.from({ length: playerCount }, (_, index) => ({
        name: names[index] || `Player ${index + 1}`,
        color: PLAYER_COLORS[index],
        ...(marks[index] ? { shape: marks[index] } : {}),
      })),
      startingLife:
        params.start !== undefined
          ? integer("start", params.start)
          : teams.length > 0
            ? defaultTeamLife(format)
            : defaultStartingLife(system, format, playerCount),
      system,
      format,
      layout,
      ...(teams.length > 0 ? { teams } : {}),
    })
  } catch (error) {
    throw new SeedError(error instanceof Error ? error.message : String(error))
  }

  const context = defaultCommandContext(repository.getDeviceId())
  const seat = (value: string) => {
    const index = integer("cmd seat", value) - 1
    const player = game.players[index]
    if (!player) throw new SeedError(`cmd seat ${value} is not in a ${playerCount} player game.`)
    return player
  }
  const damage = list(params.cmd)
  if (damage.length > 0 && !supportsCommanderDamage(system, format))
    throw new SeedError("cmd needs system=mtg&format=commander.")
  for (const entry of damage) {
    const match = /^(\d+)>(\d+):(\d+)$/.exec(entry)
    if (!match) throw new SeedError(`cmd entries look like 2>3:9, got "${entry}".`)
    const [, from, to, amount] = match
    const delta = integer("cmd damage", amount)
    if (delta < 1 || delta > MAX_COMMANDER_DAMAGE)
      throw new SeedError(`cmd damage must be 1-${MAX_COMMANDER_DAMAGE}, got "${entry}".`)
    const fromPlayerId = seat(from).id
    const toPlayerId = seat(to).id
    const before = commanderDamageBetween(game, fromPlayerId, toPlayerId)
    game = applyGameCommand(
      game,
      { type: "commanderDamage.assign", fromPlayerId, toPlayerId, delta },
      context,
    )
    if (commanderDamageBetween(game, fromPlayerId, toPlayerId) !== before + delta)
      throw new SeedError(`cmd "${entry}" was rejected by the game rules.`)
  }

  for (const entry of list(params.counters)) {
    const match = /^(\d+):([^:]+):(\d+)$/.exec(entry)
    if (!match) throw new SeedError(`counters entries look like 1:poison:3, got "${entry}".`)
    const [, seatNumber, counter, amount] = match
    const playerId = seat(seatNumber).id
    const system = playTableRules(game.system, game.format).counters
    const action: TableAction = system.some(({ id }) => id === counter)
      ? {
          kind: "counter.changed",
          playerId,
          counterId: counter,
          delta: integer("counters", amount),
        }
      : {
          kind: "customCounter.changed",
          playerId,
          name: counter,
          delta: integer("counters", amount),
        }
    const next = applyLocalTableAction(game, action, {
      operationId: createClientId("operation"),
      now: Date.now(),
    })
    if (next === game) throw new SeedError(`counters "${entry}" was rejected by the game rules.`)
    game = next
  }

  if (params.turn !== undefined)
    game = withFirstTurn(game, seat(params.turn).id, {
      operationId: createClientId("operation"),
      now: Date.now(),
    })

  life.forEach((target, index) => {
    const player = game.players[index]
    const delta = target - player.life
    if (delta !== 0)
      game = applyGameCommand(game, { type: "life.change", playerId: player.id, delta }, context)
    if (game.players[index].life !== target)
      throw new SeedError(`life ${target} for seat ${index + 1} was rejected by the game rules.`)
  })

  const groups = list(params.groups).map((entry) =>
    entry.split("+").map((value) => game.players[integer("groups seat", value) - 1]?.id ?? value),
  )
  if (groups.length > 0) {
    if (!isValidTurnGroups(groups, new Set(game.players.map(({ id }) => id))))
      throw new SeedError(`groups name each seat once, like 1+2,3+4, got "${params.groups}".`)
    game = { ...game, turnGroups: groups }
  }

  for (const entry of list(params.poison)) {
    const [seatValue, amount] = entry.split(":")
    game = applyLocalTableAction(
      game,
      {
        kind: "counter.changed",
        playerId: seat(seatValue ?? "").id,
        counterId: "poison",
        delta: integer("poison", amount ?? ""),
      },
      { operationId: context.operationId(), now: context.now() },
    )
  }
  return game
}

export function seedGame(params: SeedParams, repository = localGameRepository): Href {
  const game = buildSeededGame(params, repository)
  if (params.binding === "frame" || params.binding === "link")
    repository.saveTeamBinding(params.binding)
  repository.clearActiveGame()
  repository.saveActiveGame(game)
  return { pathname: "/", params: { destination: "play" } }
}
