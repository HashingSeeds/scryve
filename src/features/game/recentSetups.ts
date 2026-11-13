import { createLocalGame, MAX_PLAYERS, MIN_PLAYERS } from "./domain"
import { playerGridLayoutForCount, type PlayerGridLayoutVariant } from "./playerLayouts"
import { isPlaySystemId, playSystemFormat, type PlaySystemId } from "./playSystems"
import { isRoundClockSetup } from "./roundClock"
import { isSystemVisible } from "./systemVisibility"
import { isPlayerMarkShape } from "../../../convex/lib/appearance"
import { isMatchBestOf, type MatchBestOf } from "../../../convex/lib/matchResults"
import { systemDefinition } from "../../../convex/lib/systems"
import { matchesValidator } from "../../../convex/lib/table"
import {
  isValidModeSetup,
  modeSetupValidator,
  systemPlaysModeSetup,
  type ModeSetup,
} from "../../../convex/lib/tableModes"
import { isTwoVsTwoPlayerCount, TWO_VS_TWO } from "../../../convex/lib/teamVariants"
import { isTreacheryPlayerCount, type GameVariant } from "../../../convex/lib/treachery"
import { isTwoHeadedGiantPlayerCount } from "../../../convex/lib/twoHeadedGiant"

export const MAX_RECENT_SETUPS = 5

export type LocalSetup = Omit<Parameters<typeof createLocalGame>[0], "account" | "now" | "gameId">

export interface ConnectedSetup {
  playerCount: number
  startingLife: number
  ruleset: string
  system?: PlaySystemId
  format?: string
  variant?: GameVariant
  modeSetup?: ModeSetup
  layout: PlayerGridLayoutVariant
  lifeStep: number
  matchBestOf?: MatchBestOf
}

export type RecentSetup = { savedAt: number } & (
  { mode: "local"; game: LocalSetup } | { mode: "connected"; lobby: ConnectedSetup }
)

export type NewRecentSetup =
  { mode: "local"; game: LocalSetup } | { mode: "connected"; lobby: ConnectedSetup }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const isWholeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0

const isSeatTeams = (value: unknown): value is number[][] =>
  Array.isArray(value) &&
  value.every((team) => Array.isArray(team) && team.every((seat) => isWholeNumber(seat)))

const isPositiveInteger = (value: unknown): value is number => isWholeNumber(value) && value > 0

const parseModeSetup = (value: unknown, playerCount: number) =>
  matchesValidator(modeSetupValidator, value) && isValidModeSetup(value, playerCount)
    ? value
    : undefined

function parseLocalSetup(value: unknown): LocalSetup | undefined {
  if (!isRecord(value) || !Array.isArray(value.players)) return undefined
  const players = value.players.map((player: unknown) =>
    isRecord(player) && typeof player.name === "string" && typeof player.color === "string"
      ? {
          name: player.name,
          color: player.color,
          ...(isPlayerMarkShape(player.shape) ? { shape: player.shape } : {}),
        }
      : undefined,
  )
  if (players.some((player) => player === undefined) || !isWholeNumber(value.startingLife))
    return undefined
  const modeSetup = parseModeSetup(value.modeSetup, players.length)
  const setup: LocalSetup = {
    players: players.filter((player) => player !== undefined),
    startingLife: value.startingLife,
    ...(isPlaySystemId(value.system) ? { system: value.system } : {}),
    ...(typeof value.format === "string" ? { format: value.format } : {}),
    ...(typeof value.layout === "string"
      ? {
          layout: playerGridLayoutForCount(
            isSeatTeams(value.teams) ? value.teams.length : players.length,
            value.layout,
          ),
        }
      : {}),
    ...(isPositiveInteger(value.lifeStep) ? { lifeStep: value.lifeStep } : {}),
    ...(isSeatTeams(value.teams) ? { teams: value.teams } : {}),
    ...(isSeatTeams(value.teams) && value.teamVariant === TWO_VS_TWO
      ? { teamVariant: TWO_VS_TWO }
      : {}),
    ...(modeSetup ? { modeSetup } : {}),
    ...(isRecord(value.match) && isMatchBestOf(value.match.bestOf)
      ? { match: { bestOf: value.match.bestOf } }
      : {}),
    ...(isRoundClockSetup(value.clock)
      ? {
          clock:
            value.clock.mode === "countdown"
              ? { mode: "countdown" as const, minutes: value.clock.minutes }
              : { mode: "stopwatch" as const },
        }
      : {}),
  }
  try {
    createLocalGame(setup)
    return setup
  } catch {
    return undefined
  }
}

function parseConnectedSetup(value: unknown): ConnectedSetup | undefined {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.playerCount) ||
    value.playerCount < MIN_PLAYERS ||
    value.playerCount > MAX_PLAYERS ||
    !isWholeNumber(value.startingLife) ||
    typeof value.ruleset !== "string" ||
    !isPositiveInteger(value.lifeStep)
  )
    return undefined
  const system = isPlaySystemId(value.system) ? value.system : undefined
  if (value.system !== undefined && !system) return undefined
  if (
    system &&
    (typeof value.format !== "string" || playSystemFormat(system, value.format) !== value.format)
  )
    return undefined
  const modeSetup = parseModeSetup(value.modeSetup, value.playerCount)
  if (value.modeSetup !== undefined && !(modeSetup && systemPlaysModeSetup(system, modeSetup)))
    return undefined
  if (
    value.variant !== undefined &&
    !(
      (value.variant === "treachery" && isTreacheryPlayerCount(value.playerCount)) ||
      (value.variant === "twoHeadedGiant" && isTwoHeadedGiantPlayerCount(value.playerCount)) ||
      (value.variant === TWO_VS_TWO && isTwoVsTwoPlayerCount(value.playerCount)) ||
      value.variant === "archenemy"
    )
  )
    return undefined
  if (value.variant !== undefined && !systemDefinition(system)?.variants.includes(value.variant))
    return undefined
  if ((modeSetup?.archenemy !== undefined) !== (value.variant === "archenemy")) return undefined
  return {
    playerCount: value.playerCount,
    startingLife: value.startingLife,
    ruleset: value.ruleset,
    ...(system && typeof value.format === "string" ? { system, format: value.format } : {}),
    ...(value.variant === "treachery" ||
    value.variant === "twoHeadedGiant" ||
    value.variant === TWO_VS_TWO ||
    value.variant === "archenemy"
      ? { variant: value.variant }
      : {}),
    ...(modeSetup ? { modeSetup } : {}),
    layout: playerGridLayoutForCount(
      value.variant === "twoHeadedGiant" || value.variant === TWO_VS_TWO
        ? value.playerCount / 2
        : value.playerCount,
      value.layout,
    ),
    lifeStep: value.lifeStep,
  }
}

/** why: setups come back from storage written by older builds, so a bad one is dropped, never started. */
export function parseRecentSetup(value: unknown): RecentSetup | undefined {
  if (!isRecord(value) || typeof value.savedAt !== "number" || !Number.isFinite(value.savedAt))
    return undefined
  if (value.mode === "local") {
    const game = parseLocalSetup(value.game)
    return game ? { savedAt: value.savedAt, mode: "local", game } : undefined
  }
  if (value.mode === "connected") {
    const lobby = parseConnectedSetup(value.lobby)
    return lobby ? { savedAt: value.savedAt, mode: "connected", lobby } : undefined
  }
  return undefined
}

function setupKey(setup: NewRecentSetup) {
  if (setup.mode === "connected") {
    const { system, format, variant, playerCount, startingLife } = setup.lobby
    return JSON.stringify(["connected", system, format, variant, playerCount, startingLife])
  }
  const { system, format, players, startingLife } = setup.game
  const names = players.map((player) => player.name.trim())
  return JSON.stringify(["local", system, format, names, startingLife])
}

export function withRecentSetup(
  setups: readonly RecentSetup[],
  setup: NewRecentSetup,
  savedAt: number,
): RecentSetup[] {
  const key = setupKey(setup)
  return [{ ...setup, savedAt }, ...setups.filter((existing) => setupKey(existing) !== key)].slice(
    0,
    MAX_RECENT_SETUPS,
  )
}

export function isSetupReplayable(setup: RecentSetup) {
  const { system } = setup.mode === "local" ? setup.game : setup.lobby
  return !system || isSystemVisible(system)
}
