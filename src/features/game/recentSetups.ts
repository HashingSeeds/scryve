import { translate } from "@/i18n/translate"

import { createLocalGame } from "./domain"
import { playerGridLayoutForCount, type PlayerGridLayoutVariant } from "./playerLayouts"
import { isPlaySystemId, playFormatLabel, playSystemFormat, type PlaySystemId } from "./playSystems"
import { isRoundClockSetup } from "./roundClock"
import { isSystemVisible } from "./systemVisibility"
import { isPlayerMarkShape } from "../../../convex/lib/appearance"
import { isMatchBestOf } from "../../../convex/lib/matchResults"
import { systemDefinition } from "../../../convex/lib/systems"
import { isTreacheryPlayerCount, type GameVariant } from "../../../convex/lib/treachery"

export const MAX_RECENT_SETUPS = 5

export type LocalSetup = Omit<Parameters<typeof createLocalGame>[0], "account" | "now" | "gameId">

export interface ConnectedSetup {
  playerCount: number
  startingLife: number
  ruleset: string
  system?: PlaySystemId
  format?: string
  variant?: GameVariant
  deckRequired: boolean
  layout: PlayerGridLayoutVariant
  lifeStep: number
}

export type RecentSetup = { savedAt: number } & (
  { mode: "local"; game: LocalSetup } | { mode: "connected"; lobby: ConnectedSetup }
)

export type NewRecentSetup =
  { mode: "local"; game: LocalSetup } | { mode: "connected"; lobby: ConnectedSetup }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0

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
  if (players.some((player) => player === undefined) || !isPositiveInteger(value.startingLife))
    return undefined
  const setup: LocalSetup = {
    players: players.filter((player) => player !== undefined),
    startingLife: value.startingLife,
    ...(isPlaySystemId(value.system) ? { system: value.system } : {}),
    ...(typeof value.format === "string" ? { format: value.format } : {}),
    ...(typeof value.layout === "string"
      ? { layout: playerGridLayoutForCount(players.length, value.layout) }
      : {}),
    ...(isPositiveInteger(value.lifeStep) ? { lifeStep: value.lifeStep } : {}),
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
    value.playerCount < 2 ||
    value.playerCount > 6 ||
    !isPositiveInteger(value.startingLife) ||
    typeof value.ruleset !== "string" ||
    typeof value.deckRequired !== "boolean" ||
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
  if (
    value.variant !== undefined &&
    (value.variant !== "treachery" ||
      !systemDefinition(system)?.variants.includes(value.variant) ||
      !isTreacheryPlayerCount(value.playerCount))
  )
    return undefined
  return {
    playerCount: value.playerCount,
    startingLife: value.startingLife,
    ruleset: value.ruleset,
    ...(system && typeof value.format === "string" ? { system, format: value.format } : {}),
    ...(value.variant === "treachery" ? { variant: value.variant } : {}),
    deckRequired: value.deckRequired,
    layout: playerGridLayoutForCount(value.playerCount, value.layout),
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

export function recentSetupLabel(setup: RecentSetup) {
  const { system, format } = setup.mode === "local" ? setup.game : setup.lobby
  if (setup.mode === "connected" && setup.lobby.variant === "treachery")
    return translate("play:recentSetups.treachery")
  return system ? playFormatLabel(system, format) : translate("play:recentSetups.noSystem")
}

export function isSetupReplayable(setup: RecentSetup) {
  const { system } = setup.mode === "local" ? setup.game : setup.lobby
  return !system || isSystemVisible(system)
}
