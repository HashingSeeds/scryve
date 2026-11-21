import {
  createLocalGame,
  hasLocalGameStarted,
  MAX_PLAYERS,
  meSeatOf,
  PLAYER_COLORS,
  teamSeats,
} from "@/features/game/domain"
import { gameTypeId, type GameType } from "@/features/game/gameTypes"
import type { LocalSettings } from "@/features/game/localPersistence"
import {
  defaultConnectedLayout,
  playerGridLayoutForCount,
  type PlayerGridLayoutVariant,
} from "@/features/game/playerLayouts"
import {
  defaultStartingLife,
  lifePresets,
  playSystemFormat,
  playSystemRules,
  type PlaySystemId,
} from "@/features/game/playSystems"
import type { RecentSetup } from "@/features/game/recentSetups"
import { defaultRoundClockMinutes, type RoundClockSetup } from "@/features/game/roundClock"
import type { LocalGame } from "@/features/game/types"
import { modeChoicesOf, modeSetupOf, type ModeChoices } from "@/features/modes/ModeSetupFields"
import type { SelectedDeck } from "@/features/stats/deckChoices"
import { translate } from "@/i18n/translate"

import {
  LOCAL_MARK_SHAPES,
  PLAYER_COLOR_CHOICES,
  PLAYER_MARK_SHAPES,
  PRO_MARK_SHAPES,
  resolveAppearance,
  shapeForSeat,
  withoutProMarks,
  type PlayerAppearance,
} from "../../../convex/lib/appearance"
import { isCommanderFormat } from "../../../convex/lib/gameRules"
import type { MatchBestOf } from "../../../convex/lib/matchResults"
import { systemDefinition } from "../../../convex/lib/systems"
import { ARCHENEMY_MIN_SEATS } from "../../../convex/lib/tableModes"
import { isTeamPlayerCount, isTeamVariant, TWO_VS_TWO } from "../../../convex/lib/teamVariants"
import { isTreacheryPlayerCount, type GameVariant } from "../../../convex/lib/treachery"
import {
  defaultTeamLife,
  isValidTeams,
  pairedTeams,
  teamLifePresets,
} from "../../../convex/lib/twoHeadedGiant"

export const CLOCK_MODES = [
  { id: "off", labelTx: "play:newGame.clockOff" },
  { id: "countdown", labelTx: "play:newGame.clockCountdown" },
  { id: "stopwatch", labelTx: "play:newGame.clockStopwatch" },
] as const
type ClockMode = (typeof CLOCK_MODES)[number]["id"]

export const VARIANT_MIN_SEATS = 4

export interface GameDraft {
  system: PlaySystemId | undefined
  format: string | undefined
  startingLife: number
  lifeStep: number
  playerCount: number
  chosenLayout: PlayerGridLayoutVariant | undefined
  names: readonly string[]
  appearances: readonly PlayerAppearance[]
  treacheryChosen: boolean
  archenemyChosen: boolean
  modeChoices: ModeChoices
  teamsChosen: boolean
  teamDraft: readonly (readonly number[])[]
  teamColorDraft: readonly (string | undefined)[]
  meSeat: number | undefined
  deck: SelectedDeck | undefined
  matchOn: boolean
  chosenBestOf: MatchBestOf | undefined
  clockMode: ClockMode
  chosenClockMinutes: number | undefined
  hostOn: "cloud" | "nearby"
  /** why: until a format is picked, switching modes loads that mode's last setup instead of carrying this one over. */
  formatPicked: boolean
}

type SettableField =
  | "startingLife"
  | "lifeStep"
  | "chosenLayout"
  | "modeChoices"
  | "appearances"
  | "teamColorDraft"
  | "deck"
  | "chosenBestOf"
  | "clockMode"
  | "chosenClockMinutes"
  | "hostOn"

export type GameDraftPatch = Partial<Pick<GameDraft, SettableField>>

export type GameDraftAction =
  | { type: "set"; patch: GameDraftPatch }
  | { type: "chooseGameType"; gameType: GameType; confirmedFree: boolean }
  | { type: "choosePlayerCount"; count: number; confirmedFree: boolean }
  | { type: "rename"; seat: number; name: string }
  | { type: "swapSeats"; first: number; second: number; teamColors: readonly string[] }
  | { type: "chooseMeSeat"; seat: number | undefined }
  | { type: "changeAccount"; meSeat: number | undefined }
  | { type: "toggleMatch"; on: boolean }

/** why: a 2HG game's teammates share a color, but each seat keeps its own so turning teams off leaves every seat distinct. */
function ownColors(seats: PlayerAppearance[]) {
  const used = new Set<string>()
  return seats.map((appearance) => {
    const color = used.has(appearance.color.toUpperCase())
      ? (PLAYER_COLOR_CHOICES.find(
          (choice) =>
            !used.has(choice) && !seats.some(({ color }) => color.toUpperCase() === choice),
        ) ?? appearance.color)
      : appearance.color
    used.add(color.toUpperCase())
    return { ...appearance, color }
  })
}

export function initialGameDraft({
  defaults,
  replaying,
  initialGame,
  defaultMeSeat,
}: {
  defaults: LocalSettings
  replaying?: RecentSetup
  initialGame?: LocalGame
  defaultMeSeat?: number
}): GameDraft {
  const lobby = replaying?.mode === "connected" ? replaying.lobby : undefined
  const seedGame = replaying?.mode === "local" ? createLocalGame(replaying.game) : initialGame
  const seed = lobby ?? seedGame
  const system = seed ? seed.system : defaults.defaultSystem
  const seedModes = lobby ? lobby.modeSetup : seedGame?.modeSetup
  const claimedGame = replaying ? undefined : initialGame
  const claimedAccount = claimedGame?.account
  const claimedSeat = claimedGame && meSeatOf(claimedGame)
  const clock = seedGame?.clock?.setup
  return {
    system,
    format: seed?.format ?? (system ? playSystemFormat(system, defaults.defaultFormat) : undefined),
    startingLife: seed?.startingLife ?? defaults.defaultStartingLife,
    lifeStep: seed?.lifeStep ?? playSystemRules(system).counter.tapStep,
    playerCount: lobby?.playerCount ?? seedGame?.players.length ?? defaults.defaultPlayerCount,
    chosenLayout: lobby?.layout ?? seedGame?.layout,
    names: Array.from({ length: MAX_PLAYERS }, (_, index) => seedGame?.players[index]?.name ?? ""),
    appearances: ownColors(
      Array.from({ length: MAX_PLAYERS }, (_, index) => ({
        color: seedGame?.players[index]?.color ?? PLAYER_COLORS[index],
        shape:
          seedGame?.players[index]?.shape ??
          shapeForSeat(index + 1, seedGame?.players[index] ? undefined : PLAYER_MARK_SHAPES),
      })),
    ),
    treacheryChosen: lobby?.variant === "treachery",
    archenemyChosen: lobby ? lobby.variant === "archenemy" : seedModes?.archenemy !== undefined,
    modeChoices: modeChoicesOf(seedModes),
    teamsChosen: isTeamVariant(lobby?.variant) || isTeamVariant(seedGame?.variant),
    teamDraft: seedGame ? teamSeats(seedGame) : [],
    teamColorDraft:
      seedGame && isTeamVariant(seedGame.variant)
        ? teamSeats(seedGame).map(([lead]) => seedGame.players[lead]?.color)
        : [],
    meSeat:
      claimedGame && (claimedAccount || hasLocalGameStarted(claimedGame))
        ? claimedSeat
        : defaultMeSeat,
    deck:
      claimedGame && claimedAccount && (claimedAccount.deckVersionId || claimedAccount.deckKey)
        ? {
            versionId: claimedAccount.deckVersionId,
            deckKey: claimedAccount.deckKey,
            deckFingerprint: claimedAccount.deckFingerprint,
            system: claimedGame.system,
            name: claimedAccount.deckName ?? translate("play:newGame.deckFallbackName"),
            startingValue:
              claimedSeat === undefined
                ? undefined
                : claimedGame.players[claimedSeat]?.startingLife,
          }
        : undefined,
    matchOn: Boolean(seedGame?.match),
    chosenBestOf: seedGame?.match?.bestOf,
    clockMode: clock?.mode ?? "off",
    chosenClockMinutes: clock?.mode === "countdown" ? clock.minutes : undefined,
    hostOn: "cloud",
    formatPicked: false,
  }
}

function teamPlayOf({ system, teamsChosen }: Pick<GameDraft, "system" | "teamsChosen">) {
  return teamsChosen ? systemDefinition(system)?.variants.find(isTeamVariant) : undefined
}

function teamsOf(draft: GameDraft, teamPlay = teamPlayOf(draft)) {
  if (!teamPlay) return undefined
  const seats = Array.from({ length: draft.playerCount }, (_, index) => index)
  return isValidTeams(
    draft.teamDraft.map((team) => team.map(String)),
    new Set(seats.map(String)),
  )
    ? draft.teamDraft
    : pairedTeams(seats)
}

function resizeSeats(draft: GameDraft, count: number, confirmedFree: boolean): GameDraft {
  let appearances = draft.appearances
  if (count > draft.playerCount) {
    const next = confirmedFree ? withoutProMarks(appearances) : [...appearances]
    for (let index = draft.playerCount; index < count; index += 1)
      next[index] = resolveAppearance({
        preferred: appearances[index],
        taken: next.slice(0, index),
        seat: index + 1,
        shapes: confirmedFree ? undefined : [...LOCAL_MARK_SHAPES, ...PRO_MARK_SHAPES],
      })
    appearances = next
  }
  return {
    ...draft,
    appearances,
    modeChoices:
      Number(draft.modeChoices.archenemy) > count
        ? { ...draft.modeChoices, archenemy: "roll" }
        : draft.modeChoices,
    playerCount: count,
  }
}

function chooseGameType(draft: GameDraft, type: GameType, confirmedFree: boolean): GameDraft {
  const { system, format, playerCount, startingLife } = draft
  const teamPlay = teamPlayOf(draft)
  const nextTreachery = type.variant === "treachery"
  const nextTeams = isTeamVariant(type.variant)
  const nextCount =
    (nextTreachery && !isTreacheryPlayerCount(playerCount)) ||
    (isTeamVariant(type.variant) && !isTeamPlayerCount(type.variant, playerCount))
      ? VARIANT_MIN_SEATS
      : type.variant === "archenemy" && playerCount < ARCHENEMY_MIN_SEATS
        ? ARCHENEMY_MIN_SEATS
        : playerCount
  const systemChanged = type.system !== system
  const resetsLife =
    systemChanged ||
    Boolean(teamPlay) !== nextTeams ||
    startingLife === defaultStartingLife(system, format, playerCount) ||
    (teamPlay === "twoHeadedGiant" && startingLife === defaultTeamLife(format))
  const next: GameDraft = {
    ...draft,
    system: type.system,
    startingLife: !resetsLife
      ? startingLife
      : type.variant === "twoHeadedGiant"
        ? defaultTeamLife(type.format)
        : defaultStartingLife(type.system, type.format, nextCount),
    lifeStep: systemChanged ? playSystemRules(type.system).counter.tapStep : draft.lifeStep,
    ...(systemChanged || type.format !== format ? { format: type.format, deck: undefined } : {}),
    treacheryChosen: nextTreachery,
    archenemyChosen: type.variant === "archenemy",
    teamsChosen: nextTeams,
    formatPicked: true,
  }
  return nextCount === playerCount ? next : resizeSeats(next, nextCount, confirmedFree)
}

export function gameDraftReducer(draft: GameDraft, action: GameDraftAction): GameDraft {
  switch (action.type) {
    case "set":
      return { ...draft, ...action.patch }
    case "chooseGameType":
      return chooseGameType(draft, action.gameType, action.confirmedFree)
    case "choosePlayerCount": {
      const { system, format, playerCount, startingLife } = draft
      const followsDefault =
        teamPlayOf(draft) !== "twoHeadedGiant" &&
        startingLife === defaultStartingLife(system, format, playerCount)
      return resizeSeats(
        {
          ...draft,
          treacheryChosen: draft.treacheryChosen && isTreacheryPlayerCount(action.count),
          startingLife: followsDefault
            ? defaultStartingLife(system, format, action.count)
            : startingLife,
        },
        action.count,
        action.confirmedFree,
      )
    }
    case "rename":
      return {
        ...draft,
        names: draft.names.map((name, seat) => (seat === action.seat ? action.name : name)),
      }
    case "swapSeats": {
      const swap = (seat: number) =>
        seat === action.first ? action.second : seat === action.second ? action.first : seat
      return {
        ...draft,
        teamColorDraft: action.teamColors,
        teamDraft: (teamsOf(draft) ?? []).map((team) => team.map(swap)),
      }
    }
    case "chooseMeSeat":
      return {
        ...draft,
        meSeat: action.seat,
        deck: action.seat === undefined ? undefined : draft.deck,
      }
    case "changeAccount":
      return { ...draft, meSeat: action.meSeat, deck: undefined }
    case "toggleMatch":
      return { ...draft, matchOn: action.on, chosenBestOf: undefined }
  }
}

export function deriveGameSetup(draft: GameDraft, { connected }: { connected: boolean }) {
  const { system, format, playerCount, lifeStep } = draft
  const definition = systemDefinition(system)
  const teamPlay = teamPlayOf(draft)
  const teams = teamsOf(draft, teamPlay)
  const layout = playerGridLayoutForCount(
    playerCount,
    draft.chosenLayout,
    connected ? defaultConnectedLayout(playerCount) : "auto",
  )
  const treachery =
    connected && Boolean(definition?.variants.includes("treachery")) && draft.treacheryChosen
  const archenemy = Boolean(definition?.variants.includes("archenemy")) && draft.archenemyChosen
  const planechaseAvailable = definition?.planechase === true
  const variant: GameVariant | undefined = treachery
    ? "treachery"
    : archenemy
      ? "archenemy"
      : teamPlay
  const modeSetup = planechaseAvailable
    ? modeSetupOf(draft.modeChoices, { archenemy, playerCount })
    : undefined
  const matchBestOf = draft.matchOn
    ? (draft.chosenBestOf ?? (isCommanderFormat(system, format) || playerCount > 2 ? 1 : 3))
    : undefined
  const clockMinutes = draft.chosenClockMinutes ?? defaultRoundClockMinutes(system, matchBestOf)
  const clock: RoundClockSetup | undefined =
    draft.clockMode === "off"
      ? undefined
      : draft.clockMode === "countdown"
        ? { mode: "countdown", minutes: clockMinutes }
        : { mode: "stopwatch" }
  const twoHeadedGiant = teamPlay === "twoHeadedGiant"
  return {
    teamPlay,
    twoHeadedGiant,
    teams,
    layout,
    treachery,
    archenemy,
    planechaseAvailable,
    typeId: gameTypeId(system, format, variant),
    matchBestOf,
    clockMinutes,
    clock,
    lifeOptions: twoHeadedGiant ? teamLifePresets(format) : lifePresets(system, format),
    effectiveMeSeat:
      draft.meSeat !== undefined && draft.meSeat < playerCount ? draft.meSeat : undefined,
    gameSetup: {
      layout,
      lifeStep,
      ...(system && format ? { system, format } : {}),
      ...(variant ? { variant } : {}),
      ...(modeSetup ? { modeSetup } : {}),
      ...(teams && !connected
        ? { teams, ...(teamPlay === TWO_VS_TWO ? { teamVariant: teamPlay } : {}) }
        : {}),
    },
  }
}

export type GameSetupView = ReturnType<typeof deriveGameSetup>
