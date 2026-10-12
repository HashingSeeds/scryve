import type { Href } from "expo-router"

import {
  applyGameCommand,
  commanderDamageBetween,
  createLocalGame,
  defaultCommandContext,
  MAX_COMMANDER_DAMAGE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
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
  supportsCommanderDamage,
} from "@/features/game/playSystems"
import type { LocalGame } from "@/features/game/types"

import { SeedError, type SeedParams } from "./seedTypes"

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

/**
 * why: replaying real game commands keeps life, commander damage, and undo history
 * identical to a game played by hand on this device. Params:
 *
 *   system  mtg | ygo | pokemon | none (default mtg)
 *   format  a format id for the system, e.g. commander
 *   players 2-6 (default: length of life, else the app's default count)
 *   start   starting life (default: the system and format default)
 *   life    final life per seat, e.g. 40,31,12,40
 *   cmd     commander damage by seat, e.g. 2>3:9,4>3:21
 *   layout  player grid layout variant for the player count
 */
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

  const layouts = getPlayerGridLayoutOptions(playerCount).map(({ variant }) => variant)
  const layout = layouts.find((variant) => variant === (params.layout ?? "auto"))
  if (!layout)
    throw new SeedError(`layout for ${playerCount} players must be one of ${layouts.join(", ")}.`)

  let game: LocalGame
  try {
    game = createLocalGame({
      players: Array.from({ length: playerCount }, (_, index) => ({
        name: `Player ${index + 1}`,
        color: PLAYER_COLORS[index],
      })),
      startingLife:
        params.start !== undefined
          ? integer("start", params.start)
          : defaultStartingLife(system, format, playerCount),
      system,
      format,
      layout,
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
    // why: the domain silently drops self damage and clamps totals at the cap.
    if (commanderDamageBetween(game, fromPlayerId, toPlayerId) !== before + delta)
      throw new SeedError(`cmd "${entry}" was rejected by the game rules.`)
  }

  // why: life is the final value per seat, so commander damage above is already counted.
  life.forEach((target, index) => {
    const player = game.players[index]
    const delta = target - player.life
    if (delta !== 0)
      game = applyGameCommand(game, { type: "life.change", playerId: player.id, delta }, context)
    if (game.players[index].life !== target)
      throw new SeedError(`life ${target} for seat ${index + 1} was rejected by the game rules.`)
  })
  return game
}

export function seedGame(params: SeedParams, repository = localGameRepository): Href {
  const game = buildSeededGame(params, repository)
  repository.clearActiveGame()
  repository.saveActiveGame(game)
  return { pathname: "/", params: { destination: "play" } }
}
