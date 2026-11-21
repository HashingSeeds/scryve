import { useEffect, useMemo, useReducer, useRef, useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { Platform, TouchableOpacity, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { AlertNote } from "@/components/AlertNote"
import { BOTTOM_LINK_HEIGHT, BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import {
  $dialogActions,
  $dialogButton,
  DialogCard,
  type DialogOrigin,
} from "@/components/DialogCard"
import { Header, HeaderBack } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { TeamPicker } from "@/components/TeamPicker"
import { Text } from "@/components/Text"
import type { NextPageState } from "@/features/async/remoteState"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { ProSignInNote, useProSignIn } from "@/features/billing/ProSignIn"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { AppearancePicker } from "@/features/connected/AppearancePicker"
import type { ResumableGame } from "@/features/connected/connectedCopy"
import { guestDeckRouteId, useGuestDecks } from "@/features/decks/guestDeck"
import { loadSharedDecks } from "@/features/decks/sharedDecks"
import {
  hasLocalGameStarted,
  matchContextLabel,
  PLAYER_COLORS,
  validatePlayerNames,
  validateStartingLife,
} from "@/features/game/domain"
import { useFirstPlayerMode, useFreeMulligans } from "@/features/game/FirstPlayerChoice"
import { gameTypeId, newGameTabs, type GameTab, type GameType } from "@/features/game/gameTypes"
import { LocalGameEndDialog } from "@/features/game/LocalGameEndDialog"
import { LocalMatchEndDialog } from "@/features/game/LocalMatchEndDialog"
import {
  localGameRepository,
  type LocalGameAccountInput,
  type LocalSettings,
} from "@/features/game/localPersistence"
import {
  deriveGameSetup,
  gameDraftReducer,
  initialGameDraft,
  type GameDraftPatch,
} from "@/features/game/newGameDraft"
import type { PlayerGridLayoutVariant } from "@/features/game/playerLayouts"
import { counterValueLabel, NO_PLAY_SYSTEM, type PlaySystemId } from "@/features/game/playSystems"
import type { ConnectedSetup, RecentSetup } from "@/features/game/recentSetups"
import { type RoundClockSetup } from "@/features/game/roundClock"
import { teamColors } from "@/features/game/teams"
import type {
  LocalGame,
  LocalGameResult,
  MatchSeatOutcome,
  NewPlayerInput,
  PlayerId,
} from "@/features/game/types"
import type { LanSetup } from "@/features/lan/lanGame"
import {
  deckChoiceId,
  localDeckChoices,
  pinDeckChoice,
  sharedDeckChoices,
  type DeckChoice,
} from "@/features/stats/deckChoices"
import { joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { endEdge, startEdge } from "@/theme/direction"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { useCloseOnBack } from "@/utils/useCloseOnBack"

import {
  AccountSeat,
  defaultName,
  GameSetupFields,
  PlayerNames,
  SetupOptionsSheet,
  SetupStatusDialog,
} from "./NewGameSections"
import {
  PLAYER_MARK_SHAPES,
  PRO_MARK_SHAPES,
  shapeForSeat,
  withoutProMarks,
  type PlayerAppearance,
} from "../../convex/lib/appearance"
import { type MatchBestOf } from "../../convex/lib/matchResults"
import { mulliganHandSize } from "../../convex/lib/mulligans"
import { attachesDecks, identitySection, isSystemId } from "../../convex/lib/systems"
import { type ModeSetup } from "../../convex/lib/tableModes"

export type NewGameMode = "local" | "connected"

export interface ConnectedHostFeed {
  ready: boolean
  access?: { label: string; request: () => void }
  busy: boolean
  status?: string
  blockedReason?: string
  error?: string
  exitError?: string
  retry?: () => void
  activeGames?: readonly ResumableGame[]
  activeGamesNextPage?: NextPageState
  host: (setup: ConnectedSetup) => void
  exitGame: (game: ResumableGame) => Promise<boolean>
}

export type { DeckChoice } from "@/features/stats/deckChoices"

export interface LocalAccountSetup {
  ownerId: string
  defaultMeSeat?: number
  decks?: readonly DeckChoice[] | "unavailable"
}

export interface NewGameScreenProps {
  defaults: LocalSettings
  mode: NewGameMode
  onModeChange: (mode: NewGameMode) => void
  onBack: () => void
  onStartLocal: (
    players: NewPlayerInput[],
    startingLife: number,
    setup: {
      system?: PlaySystemId
      format?: string
      layout: PlayerGridLayoutVariant
      lifeStep: number
      account?: LocalGameAccountInput
      match?: { bestOf: MatchBestOf }
      clock?: RoundClockSetup
      modeSetup?: ModeSetup
    },
  ) => void
  connected?: ConnectedHostFeed
  initialGame?: LocalGame
  recentSetups?: readonly RecentSetup[]
  localGame?: LocalGame
  account?: LocalAccountSetup
  onResumeLocal?: () => void
  onEndLocal?: (result: LocalGameResult) => void
  onAbandonLocal?: () => void
  onSavePlayers?: (players: NewPlayerInput[], account?: LocalGameAccountInput) => void
  onJoin?: () => void
  onResumeConnected?: (game: ResumableGame) => void
  onNearby?: (setup: LanSetup) => void
  /** Publishes the running local game as a connected game. Absent when the flow is unavailable. */
  localConnect?: LocalConnectFeed
  localMatchEnd?: { game: LocalGame; onEnd: (outcomes: MatchSeatOutcome[]) => void }
  initialDeckId?: string
}

export interface LocalConnectFeed {
  /** Set when the account gate has to be cleared first, mirroring `ConnectedHostFeed`. */
  access?: { label: string; request: () => void }
  ready?: boolean
  busy?: boolean
  error?: string
  publish: (hostPlayerId: PlayerId) => void
}

const NEW_GAME_FIELDS = [
  "system",
  "format",
  "startingLife",
  "lifeStep",
  "playerCount",
  "layout",
  "treacheryChosen",
  "teamsChosen",
  "teams",
  "matchOn",
  "chosenBestOf",
  "clockMode",
  "chosenClockMinutes",
] as const

/** why: a recent row keeps no deck, so a game already holding one seeds the form itself. */
function newestRecent(
  props: Pick<NewGameScreenProps, "localGame" | "initialGame" | "recentSetups" | "mode">,
) {
  const deckChosen =
    props.initialGame?.account?.deckKey ?? props.initialGame?.account?.deckVersionId
  return props.localGame || deckChosen
    ? undefined
    : props.recentSetups?.find(({ mode }) => mode === props.mode)
}

export function NewGameScreen(props: NewGameScreenProps) {
  const [replay, setReplay] = useState(() => ({ setup: newestRecent(props), key: 0 }))
  return (
    <NewGameForm
      key={replay.key}
      {...props}
      replaying={replay.setup}
      onReplay={(setup) => setReplay(({ key }) => ({ setup, key: key + 1 }))}
    />
  )
}

function NewGameForm({
  defaults,
  mode,
  onModeChange,
  onBack,
  onStartLocal,
  connected,
  initialGame,
  recentSetups,
  replaying,
  onReplay,
  localGame,
  account,
  onResumeLocal,
  onEndLocal,
  onAbandonLocal,
  onSavePlayers,
  onJoin,
  onResumeConnected,
  onNearby,
  localConnect,
  localMatchEnd,
  initialDeckId,
}: NewGameScreenProps & {
  replaying?: RecentSetup
  onReplay: (setup: RecentSetup) => void
}) {
  const {
    themed,
    theme: { colors, spacing },
  } = useAppTheme()
  const { fontScale, width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  // why: the iPhone Duo's outer display reports its status bar only as a side inset, so the toggle steps in where it would run under it.
  const toggleOverhang = (inset: number) =>
    Math.max(inset - (width - Math.min(width, CONTENT_MAX_WIDTH)) / 2 - spacing.md, 0)
  const auth = useAuthAccess()
  const billing = useRevenueCat()
  // why: until RevenueCat answers, a Pro player's saved marks look unpaid; trading them then would save the downgrade.
  const confirmedFree =
    (auth.isLoaded && !auth.isSignedIn) || (billing.customerInfo !== null && !billing.isCountPro)
  const [draft, dispatch] = useReducer(
    gameDraftReducer,
    { defaults, replaying, initialGame, defaultMeSeat: account?.defaultMeSeat },
    initialGameDraft,
  )
  const { system, format, startingLife, playerCount, names, appearances, deck } = draft
  const set = (patch: GameDraftPatch) => dispatch({ type: "set", patch })
  const connectedMode = mode === "connected"
  const setup = deriveGameSetup(draft, { connected: connectedMode })
  const {
    teamPlay,
    teams,
    layout,
    typeId: selectedTypeId,
    matchBestOf,
    clock: clockSetup,
    gameSetup,
    effectiveMeSeat,
  } = setup
  const ownAppearances = useMemo(
    () => (confirmedFree ? withoutProMarks(appearances) : appearances),
    [appearances, confirmedFree],
  )
  // why: on iOS the paywall can only present once the picker's modal has finished dismissing.
  const [paywall, setPaywall] = useState<"closed" | "waitingForDismiss" | "open">("closed")
  const [appearanceSeat, setAppearanceSeat] = useState<number>()
  const [appearanceDraft, setAppearanceDraft] = useState<PlayerAppearance>()
  const [appearanceOrigin, setAppearanceOrigin] = useState<DialogOrigin>()
  const [openTeam, setOpenTeam] = useState<number>()
  const withTeamColors = (seats: readonly PlayerAppearance[], chosen = draft.teamColorDraft) => {
    if (!teams) return seats
    const colors = teamColors(
      teams.map(([lead]) => seats[lead].color),
      chosen,
    )
    return seats.map((appearance, seat) => {
      const team = teams.findIndex((members) => members.includes(seat))
      return team < 0 ? appearance : { ...appearance, color: colors[team] }
    })
  }
  const seatAppearances = withTeamColors(ownAppearances)
  const guestDecks = useGuestDecks()
  const [sharedDecks] = useState(loadSharedDecks)
  const [pinning, setPinning] = useState(false)
  const pinningRef = useRef<symbol | undefined>(undefined)
  // why: a sign-out or account switch while this screen stays mounted must not hand the previous account's seat and deck to the new one.
  const seenOwnerId = useRef(account?.ownerId)
  useEffect(() => {
    if (seenOwnerId.current === account?.ownerId) return
    seenOwnerId.current = account?.ownerId
    pinningRef.current = undefined
    setPinning(false)
    dispatch({ type: "changeAccount", meSeat: account?.defaultMeSeat })
  }, [account?.defaultMeSeat, account?.ownerId])
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [edited, setEdited] = useState(false)
  const [playerSaveError, setPlayerSaveError] = useState<string>()
  const [gameToExit, setGameToExit] = useState<ResumableGame>()
  const [exitingGameId, setExitingGameId] = useState<string>()
  const [pickingHostSeat, setPickingHostSeat] = useState(false)
  const nearbyMode = connectedMode && Boolean(onNearby) && draft.hostOn === "nearby"
  const cloudMode = connectedMode && !nearbyMode
  const optionsDraft = { ...draft, layout, teams }
  const draftChanged = (from: typeof optionsDraft) =>
    NEW_GAME_FIELDS.some((field) => from[field] !== optionsDraft[field])
  const optionsOpenedWith = useRef(optionsDraft)
  // why: iOS drops a modal presented while another dismisses, so the end prompt waits for the options sheet to close. Closing the prompt keeps the staged setup for the next New game.
  const [ending, setEnding] = useState<{ afterSheet?: boolean }>()
  const preparing = cloudMode && Boolean(connected?.status) && !connected?.ready
  const [showPreparation, setShowPreparation] = useState(false)
  useEffect(() => {
    setShowPreparation(false)
    if (!preparing) return
    const timer = setTimeout(() => setShowPreparation(true), 200)
    return () => clearTimeout(timer)
  }, [preparing])
  const validLife = validateStartingLife(startingLife, system)
  const seatNames = useMemo(
    () => names.slice(0, playerCount).map((name, index) => name.trim() || defaultName(index)),
    [names, playerCount],
  )
  const nameValidation = validatePlayerNames(seatNames)
  const players = useMemo(
    () =>
      nameValidation.names.map((name, index) => ({
        name,
        color: seatAppearances[index]?.color ?? PLAYER_COLORS[index],
        shape: seatAppearances[index]?.shape ?? shapeForSeat(index + 1, PLAYER_MARK_SHAPES),
      })),
    [seatAppearances, nameValidation.names],
  )
  const matchOffered = connectedMode || !localGame
  const gameTabs = useMemo(
    () =>
      newGameTabs({
        chosen: defaults.defaultSystem
          ? { system: defaults.defaultSystem, format: defaults.defaultFormat }
          : undefined,
        recent: (recentSetups ?? []).map((recent) =>
          recent.mode === "local" ? recent.game : recent.lobby,
        ),
        connected: connectedMode,
      }),
    [connectedMode, defaults.defaultFormat, defaults.defaultSystem, recentSetups],
  )
  const optionParts = [
    ...(matchOffered && matchBestOf
      ? [translate("play:newGame.bestOfCount", { bestOf: matchBestOf })]
      : []),
    ...(!connectedMode && !localGame && clockSetup
      ? [
          clockSetup.mode === "countdown"
            ? translate("play:newGame.clockMinutes", { minutes: clockSetup.minutes })
            : translate("play:newGame.clockStopwatch"),
        ]
      : []),
  ]
  const optionsSummary = joinParts(optionParts)
  const setupSummary = joinParts([
    connectedMode
      ? translate("play:newGame.seatsCount", { count: playerCount })
      : translate("play:summary.playerCount", { count: playerCount }),
    counterValueLabel(system, startingLife),
    ...optionParts,
  ])
  const matchLocked = Boolean(
    initialGame?.match && (initialGame.match.gameNumber > 1 || hasLocalGameStarted(initialGame)),
  )
  const deckList = account?.decks === "unavailable" ? undefined : account?.decks
  const deckChoices = [
    ...(deckList ?? []),
    ...localDeckChoices(guestDecks),
    ...sharedDeckChoices(sharedDecks),
  ].filter((choice) => choice.system === system && choice.format === format)
  const deckSetsLife = Boolean(deck && identitySection(system, format)?.startingValueFacet)
  const deckLife = deckSetsLife
    ? (deck?.startingValue ??
      deckChoices.find((choice) => deckChoiceId(choice) === (deck && deckChoiceId(deck)))
        ?.startingValue)
    : undefined
  const deckLifeLoading =
    deckSetsLife &&
    !deck?.localId &&
    !deck?.sharedToken &&
    deckLife === undefined &&
    account?.decks === undefined
  const tracksMulligans = !connectedMode && !teamPlay && mulliganHandSize(system) !== undefined
  const connectedMulligans = connectedMode && !teamPlay && mulliganHandSize(system) !== undefined
  const [firstPlayerMode] = useFirstPlayerMode(localGameRepository, system)
  const [freeMulligans, setFreeMulligans] = useFreeMulligans(system, format, playerCount)
  const accountInput = useMemo<LocalGameAccountInput | undefined>(
    () =>
      account
        ? {
            ownerId: account.ownerId,
            meSeat: effectiveMeSeat,
            ...(deck
              ? {
                  deckVersionId: deck.versionId,
                  deckKey: deck.deckKey,
                  deckFingerprint: deck.deckFingerprint,
                  deckName: deck.name,
                  ...(tracksMulligans ? { freeMulligans } : {}),
                }
              : {}),
          }
        : undefined,
    [account, deck, effectiveMeSeat, freeMulligans, tracksMulligans],
  )
  const localReady = validLife && nameValidation.valid && !deckLifeLoading
  const valid = nearbyMode
    ? validLife
    : connectedMode
      ? validLife && Boolean(connected?.ready || connected?.access) && !connected?.blockedReason
      : localReady && !localGame
  const busy = pinning || (cloudMode && Boolean(connected?.busy))
  const connectedGames = connected?.activeGames ?? []
  const localGameBlocksStart = Boolean(localGame)
  const matchBlocks = Boolean(localGame?.match)
  const changeEndsGame =
    !connectedMode && localGameBlocksStart && !matchBlocks && Boolean(onEndLocal)
  const matchLocksSetup = !connectedMode && matchBlocks
  const [endingMatch, setEndingMatch] = useState(false)
  const connectedBlocksLocal =
    !connectedMode && Boolean(connected?.ready) && connectedGames.length > 0
  const hostedGame = cloudMode ? connectedGames.find((game) => game.isHost) : undefined
  const singleBlockingConnected =
    connectedBlocksLocal && connectedGames.length === 1 ? connectedGames[0] : undefined
  const gameBlocksStart = localGameBlocksStart || connectedBlocksLocal || Boolean(hostedGame)
  const resumeGame = cloudMode && connectedGames.length === 1 ? hostedGame : undefined
  const hostedResumable =
    connectedMode || !onResumeConnected ? undefined : connectedGames.find((game) => game.isHost)
  /** Only a running local game can be handed to the server; a connected one is already there. */
  const canConnectLocal = Boolean(localConnect) && !connectedMode && localGameBlocksStart
  const footerRow =
    (canConnectLocal || Boolean(localMatchEnd)) && fontScale <= FOOTER_ROW_MAX_FONT_SCALE
  const joinInFooter = connectedMode && Boolean(onJoin)
  // why: a running game sits behind setup, so back names it and returns to it. Setup opens over the local board, so plain back reaches a local game.
  const resumeConnected =
    localGame || !onResumeConnected
      ? undefined
      : resumeGame && connected?.ready && !connected.error
        ? () => onResumeConnected(resumeGame)
        : singleBlockingConnected
          ? () => onResumeConnected(singleBlockingConnected)
          : undefined
  const resume = localGame ? onBack : resumeConnected
  const statusResumesMatch = !connectedMode && Boolean(localGame?.match)

  const hasStatusDetails = cloudMode
    ? Boolean(connectedGames.length || connected?.blockedReason || connected?.error)
    : Boolean(localGame) || connectedBlocksLocal
  const statusText = nearbyMode
    ? ""
    : connectedMode
      ? (connected?.error ??
        connected?.blockedReason ??
        (connectedGames.length ? translate("play:newGame.gamesInProgress") : ""))
      : localGame?.match
        ? translate("play:newGame.matchStatus", {
            context: matchContextLabel(localGame),
            bestOf: localGame.match.bestOf,
          })
        : connectedBlocksLocal
          ? translate("play:newGame.gamesInProgress")
          : ""

  async function submit() {
    if (!valid || busy || pinningRef.current) return
    if (cloudMode && connected?.access) {
      connected.access.request()
      return
    }
    const pregameSetup = {
      ...(firstPlayerMode === "off" ? {} : { firstPlayerMode }),
      ...(connectedMulligans ? { freeMulligans } : {}),
    }
    if (nearbyMode)
      onNearby?.({
        playerCount,
        startingLife,
        ruleset: format ?? NO_PLAY_SYSTEM,
        ...gameSetup,
        ...(matchBestOf ? { matchBestOf } : {}),
        ...pregameSetup,
      })
    else if (connectedMode)
      connected?.host({
        playerCount,
        startingLife,
        ruleset: format ?? NO_PLAY_SYSTEM,
        ...gameSetup,
        ...(matchBestOf ? { matchBestOf } : {}),
        ...pregameSetup,
      })
    else await startLocal()
  }

  async function startLocal() {
    if (!localReady || pinningRef.current) return
    const request = Symbol()
    pinningRef.current = request
    setPinning(true)
    setPlayerSaveError(undefined)
    try {
      const pinned =
        deck && accountInput?.meSeat !== undefined
          ? await pinDeckChoice(deck, accountInput.ownerId)
          : undefined
      if (pinningRef.current !== request || seenOwnerId.current !== accountInput?.ownerId) return
      onStartLocal(
        deckLife === undefined
          ? players
          : players.map((player, seat) =>
              seat === effectiveMeSeat ? { ...player, startingLife: deckLife } : player,
            ),
        startingLife,
        {
          ...gameSetup,
          account: accountInput ? { ...accountInput, ...pinned } : undefined,
          ...(matchBestOf ? { match: { bestOf: matchBestOf } } : {}),
          ...(clockSetup ? { clock: clockSetup } : {}),
        },
      )
    } catch (cause) {
      if (pinningRef.current !== request) return
      setPlayerSaveError(
        cause instanceof Error ? cause.message : translate("play:newGame.savePlayersFailed"),
      )
    } finally {
      if (pinningRef.current === request) {
        pinningRef.current = undefined
        setPinning(false)
      }
    }
  }

  function endThenStart(end: () => void) {
    if (!connectedMode && !localReady)
      throw new Error(nameValidation.errors.find(Boolean) ?? translate("board:endGame.failed"))
    end()
    setEnding(undefined)
    if (connectedMode) return
    setEdited(true)
    void startLocal()
  }

  function openOptions() {
    optionsOpenedWith.current = optionsDraft
    setOptionsOpen(true)
  }

  function closeOptions() {
    setOptionsOpen(false)
    const before = optionsOpenedWith.current
    if (!draftChanged(before)) return
    if (changeEndsGame) setEnding({ afterSheet: Platform.OS === "ios" })
    else setEdited(true)
  }

  function pickGameType(type: GameType) {
    if (type.id === selectedTypeId) return
    chooseGameType(type)
    if (changeEndsGame) setEnding({})
    else setEdited(true)
  }

  function changeMode(next: NewGameMode) {
    onModeChange(next)
    const nextRecent = newestRecent({ localGame, recentSetups, mode: next })
    if (nextRecent && !draft.formatPicked) onReplay(nextRecent)
  }

  function chooseGameType(type: GameType) {
    if (type.system !== system || type.format !== format) {
      pinningRef.current = undefined
      setPinning(false)
    }
    dispatch({ type: "chooseGameType", gameType: type, confirmedFree })
  }

  // why: only the seat and deck pickers may claim a game; a rename must not move it to whoever is signed in now.
  function savePlayers(nextAppearances = seatAppearances, nextAccount?: LocalGameAccountInput) {
    if (!onSavePlayers || !initialGame) return
    const savedNames = validatePlayerNames(
      initialGame.players.map((_, index) => names[index].trim() || defaultName(index)),
    )
    if (!savedNames.valid) return
    setPlayerSaveError(undefined)
    try {
      onSavePlayers(
        savedNames.names.map((name, index) => ({ name, ...nextAppearances[index] })),
        nextAccount,
      )
    } catch (cause) {
      setPlayerSaveError(
        cause instanceof Error ? cause.message : translate("play:newGame.savePlayersFailed"),
      )
    }
  }

  function chooseMeSeat(value: string | undefined) {
    pinningRef.current = undefined
    setPinning(false)
    const seat = value === undefined ? undefined : Number(value)
    dispatch({ type: "chooseMeSeat", seat })
    if (accountInput)
      savePlayers(seatAppearances, {
        ...accountInput,
        meSeat: seat,
        ...(seat === undefined
          ? {
              deckVersionId: undefined,
              deckKey: undefined,
              deckFingerprint: undefined,
              deckName: undefined,
            }
          : {}),
      })
  }

  async function chooseDeck(id: string | undefined) {
    if (deck && deckChoiceId(deck) === id) return
    const request = Symbol()
    pinningRef.current = request
    const previous = deck
    const choice = deckChoices.find((candidate) => deckChoiceId(candidate) === id)
    const selected = choice && {
      ...choice,
      startingValue: choice.localId || choice.sharedToken ? choice.startingValue : undefined,
    }
    set({ deck: selected })
    setPlayerSaveError(undefined)
    try {
      if (!accountInput || !onSavePlayers || !initialGame) return
      setPinning(true)
      const pinned = selected
        ? await pinDeckChoice(selected, accountInput.ownerId)
        : {
            deckVersionId: undefined,
            deckKey: undefined,
            deckFingerprint: undefined,
            deckName: undefined,
          }
      if (pinningRef.current !== request || seenOwnerId.current !== accountInput.ownerId) return
      if (selected)
        set({
          deck: { ...selected, deckKey: pinned.deckKey, deckFingerprint: pinned.deckFingerprint },
        })
      savePlayers(seatAppearances, { ...accountInput, ...pinned })
    } catch (cause) {
      if (pinningRef.current !== request) return
      set({ deck: previous })
      setPlayerSaveError(
        cause instanceof Error ? cause.message : translate("play:newGame.savePlayersFailed"),
      )
    } finally {
      if (pinningRef.current === request) {
        pinningRef.current = undefined
        setPinning(false)
      }
    }
  }

  // why: decks load after mount, and each step below needs the previous one rendered: the format filters the deck list, and only a claimed seat can hold a deck.
  const wantedDeckId = useRef(initialDeckId)
  useEffect(() => {
    const wanted = wantedDeckId.current
    if (!wanted || localGame || pinning) return
    const choice = [
      ...(deckList ?? []),
      ...localDeckChoices(guestDecks),
      ...sharedDeckChoices(sharedDecks),
    ].find(
      (candidate) =>
        candidate.deckId === wanted ||
        (candidate.sharedToken !== undefined && candidate.deckKey === wanted) ||
        (candidate.localId !== undefined && guestDeckRouteId(candidate.localId) === wanted),
    )
    if (!choice || !isSystemId(choice.system)) {
      if (account?.decks !== undefined) wantedDeckId.current = undefined
      return
    }
    if (choice.system !== system || choice.format !== format) {
      chooseGameType({
        id: gameTypeId(choice.system, choice.format),
        system: choice.system,
        format: choice.format,
      })
      return
    }
    if (!attachesDecks(system)) {
      wantedDeckId.current = undefined
      return
    }
    if (!account) return
    if (effectiveMeSeat === undefined) {
      const seat = account.defaultMeSeat ?? 0
      chooseMeSeat(String(seat < playerCount ? seat : 0))
      return
    }
    wantedDeckId.current = undefined
    void chooseDeck(deckChoiceId(choice))
  })
  const backStarts = !connectedMode && !gameBlocksStart && edited && localReady && !busy
  function back() {
    if (backStarts) void startLocal()
    else (resume ?? onBack)()
  }
  useCloseOnBack(backStarts, back)

  async function confirmExit() {
    if (!gameToExit || !connected?.exitGame) return
    setExitingGameId(gameToExit.publicId)
    const exited = await connected.exitGame(gameToExit)
    setExitingGameId(undefined)
    if (exited) setGameToExit(undefined)
  }

  function openAppearancePicker(index: number, event?: GestureResponderEvent) {
    setAppearanceOrigin(
      event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined,
    )
    setAppearanceDraft(seatAppearances[index])
    setAppearanceSeat(index)
  }

  function closeAppearancePicker() {
    setAppearanceSeat(undefined)
    setAppearanceDraft(undefined)
    pro.dismiss()
  }

  async function presentPaywall() {
    setPaywall("open")
    await billing.presentPaywall()
    setPaywall("closed")
  }

  function openPaywall() {
    if (appearanceSeat !== undefined && Platform.OS === "ios") setPaywall("waitingForDismiss")
    else void presentPaywall()
  }
  const pro = useProSignIn(openPaywall)

  function signInForPro() {
    closeAppearancePicker()
    pro.signIn()
  }

  function saveAppearance() {
    if (appearanceSeat === undefined || !appearanceDraft) return
    const drafted = ownAppearances.map((appearance, index) =>
      index !== appearanceSeat
        ? appearance
        : teams
          ? { ...appearance, shape: appearanceDraft.shape }
          : appearanceDraft,
    )
    const next = confirmedFree ? withoutProMarks(drafted) : drafted
    set({ appearances: next })
    setEdited(true)
    savePlayers(withTeamColors(next))
    closeAppearancePicker()
  }

  function chooseTeamColor(team: number, color: string) {
    const chosen = Array.from({ length: teams?.length ?? 0 }, (_, index) =>
      index === team ? color : draft.teamColorDraft[index],
    )
    set({ teamColorDraft: chosen })
    setEdited(true)
    savePlayers(withTeamColors(ownAppearances, chosen))
  }

  return (
    <View style={[themed($root), $styles.flex1]}>
      <View style={themed($setupHeader)}>
        <Header
          titleTx={onSavePlayers ? "play:newGame.setupTitle" : "play:newGame.newTitle"}
          LeftActionComponent={
            <HeaderBack
              testID="setup-back"
              label={translate(resume ? "common:appNavigation.game" : "common:appNavigation.play")}
              onPress={back}
            />
          }
          backgroundColor={colors.surface}
        />
        <View
          style={{
            marginStart: toggleOverhang(insets[startEdge]),
            marginEnd: toggleOverhang(insets[endEdge]),
          }}
        >
          <SegmentedControl
            testID="mode"
            accessibilityLabel={translate("play:newGame.connectionLabel")}
            segments={[
              { id: "local", label: translate("play:newGame.onThisDevice") },
              { id: "connected", label: translate("play:newGame.connected") },
            ]}
            selectedId={mode}
            onSelect={(value) => changeMode(value === "connected" ? "connected" : "local")}
          />
        </View>
      </View>
      <>
        <Screen
          preset="scroll"
          contentInset="standard"
          backgroundColor={colors.surface}
          contentContainerStyle={themed($form)}
        >
          <GameSetupFields
            draft={draft}
            setup={setup}
            tabs={matchLocksSetup ? tabsLockedTo(gameTabs, selectedTypeId) : gameTabs}
            connected={connectedMode}
            lockedSummary={matchLocksSetup ? setupSummary : undefined}
            optionsSummary={optionsSummary}
            seatNames={seatNames}
            mulligans={
              connectedMulligans ? { rule: freeMulligans, onChange: setFreeMulligans } : undefined
            }
            onChooseType={pickGameType}
            onPlayerCount={(count) => {
              dispatch({ type: "choosePlayerCount", count, confirmedFree })
              setEdited(true)
            }}
            onStartingLife={(value) => {
              set({ startingLife: value })
              setEdited(true)
            }}
            onModeChoices={(next) => {
              set({ modeChoices: next })
              setEdited(true)
            }}
            onOpenOptions={openOptions}
          />

          {connectedMode && onNearby ? (
            <View style={themed($section)}>
              <Text tx="play:newGame.hostOn" preset="subheading" accessibilityRole="header" />
              <SegmentedControl
                testID="host-on"
                accessibilityLabel={translate("play:newGame.hostOn")}
                segments={[
                  { id: "cloud", label: translate("play:newGame.cloud") },
                  { id: "nearby", label: translate("play:newGame.nearby") },
                ]}
                selectedId={draft.hostOn}
                onSelect={(value) => set({ hostOn: value === "nearby" ? "nearby" : "cloud" })}
              />
            </View>
          ) : null}
          {hostedResumable ? (
            <View style={themed($section)}>
              <Button
                testID="resume-hosted-connected-button"
                tx="play:newGame.resumeHostedGame"
                onPress={() => onResumeConnected?.(hostedResumable)}
              />
            </View>
          ) : null}

          {!connectedMode ? (
            <PlayerNames
              players={players}
              names={names}
              errors={nameValidation.errors}
              onOpenAppearance={openAppearancePicker}
              onRename={(seat, name) => {
                setEdited(true)
                dispatch({ type: "rename", seat, name })
              }}
              onNameBlur={() => savePlayers()}
            >
              {teams ? (
                <TeamPicker
                  players={players}
                  teams={teams}
                  colors={{
                    values: teams.map(([lead]) => seatAppearances[lead].color),
                    open: openTeam,
                    onOpen: setOpenTeam,
                    onChange: chooseTeamColor,
                  }}
                  onSwap={(first, second) => {
                    dispatch({
                      type: "swapSeats",
                      first,
                      second,
                      teamColors: teams.map(([lead]) => seatAppearances[lead].color),
                    })
                    setEdited(true)
                  }}
                />
              ) : null}
              {account ? (
                <AccountSeat
                  seatNames={nameValidation.names}
                  meSeat={effectiveMeSeat}
                  disabled={pinning || matchLocked}
                  onSeat={(value) => {
                    setEdited(true)
                    chooseMeSeat(value)
                  }}
                  deckPicker={
                    effectiveMeSeat !== undefined && system && attachesDecks(system)
                      ? {
                          deck,
                          choices: deckChoices,
                          decks: account.decks,
                          disabled:
                            pinning ||
                            matchLocked ||
                            (deckList === undefined && deckChoices.length === 0 && !deck),
                          onChoose: (id) => {
                            setEdited(true)
                            void chooseDeck(id)
                          },
                        }
                      : undefined
                  }
                  mulligans={
                    deck && tracksMulligans && effectiveMeSeat !== undefined
                      ? {
                          rule: freeMulligans,
                          onChange: (rule) => {
                            setEdited(true)
                            setFreeMulligans(rule)
                            if (accountInput)
                              savePlayers(seatAppearances, { ...accountInput, freeMulligans: rule })
                          },
                        }
                      : undefined
                  }
                />
              ) : null}
              {playerSaveError ? <Text accessibilityRole="alert" text={playerSaveError} /> : null}
            </PlayerNames>
          ) : null}
        </Screen>
        <BottomActionBar endsWithLink={Boolean(statusText || joinInFooter)} style={themed($footer)}>
          <View style={themed($footerContent)}>
            <View style={themed(footerRow ? $footerActions : $footerStack)}>
              <Button
                testID={connectedMode ? "host-connected-button" : "start-game-button"}
                text={
                  gameBlocksStart
                    ? matchBlocks
                      ? translate("play:newGame.continueMatch")
                      : changeEndsGame
                        ? translate("play:newGame.newTitle")
                        : translate("play:newGame.endCurrentGame")
                    : nearbyMode
                      ? translate("play:newGame.hostLobby")
                      : connectedMode
                        ? (connected?.access?.label ??
                          (busy
                            ? translate("play:newGame.working")
                            : preparing && showPreparation
                              ? connected?.status
                              : translate("play:newGame.hostLobby")))
                        : undefined
                }
                tx={connectedMode || gameBlocksStart ? undefined : "play:startGame"}
                preset={changeEndsGame ? "secondary" : "primary"}
                TextProps={$footerButtonText}
                style={footerRow && themed($footerAction)}
                disabled={
                  localGameBlocksStart
                    ? matchBlocks
                      ? !onResumeLocal
                      : !onEndLocal || Boolean(localConnect?.busy)
                    : hostedGame
                      ? !connected?.ready || busy
                      : connectedBlocksLocal
                        ? !connected?.exitGame || busy
                        : !valid || busy
                }
                accessibilityHint={
                  gameBlocksStart
                    ? matchBlocks
                      ? translate("play:newGame.continueMatchHint")
                      : translate("play:newGame.endCurrentGameHint")
                    : nearbyMode
                      ? translate("play:newGame.nearbyHint")
                      : connectedMode
                        ? translate("play:newGame.hostLobbyHint")
                        : translate("play:newGame.startGameHint")
                }
                onPress={
                  localGameBlocksStart
                    ? matchBlocks
                      ? onResumeLocal
                      : () => setEnding({})
                    : hostedGame
                      ? () => setGameToExit(hostedGame)
                      : singleBlockingConnected
                        ? () => setGameToExit(singleBlockingConnected)
                        : connectedBlocksLocal
                          ? () => setShowStatus(true)
                          : submit
                }
              />
              {localMatchEnd ? (
                <Button
                  testID="end-match-setup-button"
                  tx="play:newGame.endMatch"
                  TextProps={$footerButtonText}
                  style={footerRow ? themed($footerAction) : undefined}
                  accessibilityHint={translate("play:newGame.endMatchHint")}
                  onPress={() => setEndingMatch(true)}
                />
              ) : null}
              {canConnectLocal ? (
                <Button
                  testID="connect-local-button"
                  text={localConnect?.access?.label ?? translate("play:newGame.connect")}
                  TextProps={$footerButtonText}
                  style={footerRow ? themed($footerAction) : undefined}
                  disabled={localConnect?.busy || localConnect?.ready === false}
                  accessibilityHint={translate("play:newGame.connectHint")}
                  onPress={() =>
                    localConnect?.access ? localConnect.access.request() : setPickingHostSeat(true)
                  }
                />
              ) : null}
            </View>
            {joinInFooter || statusText ? (
              <View style={themed($secondaryRow)}>
                {joinInFooter ? (
                  <TouchableOpacity
                    testID="join-with-code-button"
                    accessibilityRole="button"
                    style={[themed($statusRow), themed($resumeAction)]}
                    onPress={onJoin}
                  >
                    <Text
                      tx="play:newGame.joinWithCode"
                      size="xs"
                      numberOfLines={1}
                      maxFontSizeMultiplier={FOOTER_MAX_FONT_SCALE}
                      style={themed($resumeText)}
                    />
                  </TouchableOpacity>
                ) : null}
                {statusText ? (
                  <TouchableOpacity
                    testID="setup-status"
                    accessibilityRole={hasStatusDetails ? "button" : "text"}
                    accessibilityLabel={statusText}
                    accessibilityHint={
                      statusResumesMatch
                        ? translate("play:newGame.continueMatchHint")
                        : hasStatusDetails
                          ? translate("play:newGame.statusDetailsHint")
                          : undefined
                    }
                    disabled={!hasStatusDetails}
                    style={[
                      themed($statusRow),
                      statusResumesMatch || (connectedMode && hasStatusDetails)
                        ? themed($resumeAction)
                        : $styles.flex1,
                    ]}
                    onPress={statusResumesMatch ? onResumeLocal : () => setShowStatus(true)}
                  >
                    <Text
                      accessibilityLiveRegion="polite"
                      size="xs"
                      numberOfLines={1}
                      maxFontSizeMultiplier={FOOTER_MAX_FONT_SCALE}
                      text={statusText}
                      style={themed(
                        statusResumesMatch || (connectedMode && hasStatusDetails)
                          ? $resumeText
                          : $statusText,
                      )}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
        </BottomActionBar>
      </>
      <SetupOptionsSheet
        visible={optionsOpen}
        onClose={closeOptions}
        onDismissed={() =>
          setEnding((current) =>
            current?.afterSheet ? { ...current, afterSheet: false } : current,
          )
        }
        draft={draft}
        setup={setup}
        onChange={set}
        onToggleMatch={(on) => dispatch({ type: "toggleMatch", on })}
        matchOffered={matchOffered}
        clockOffered={!connectedMode && !localGame}
      />
      <SetupStatusDialog
        visible={showStatus}
        onClose={() => setShowStatus(false)}
        connectedMode={connectedMode}
        connected={connected}
        busy={busy}
        onResumeConnected={onResumeConnected}
        onExit={(game) => {
          setShowStatus(false)
          setGameToExit(game)
        }}
      />
      {gameToExit ? (
        <ConfirmDialog
          visible
          title={translate(
            gameToExit.isHost ? "play:newGame.endGameTitle" : "play:newGame.leaveGameTitle",
          )}
          backdropAccessibilityLabel={translate(
            gameToExit.isHost ? "play:newGame.cancelEndGame" : "play:newGame.cancelLeaveGame",
          )}
          message={translate(
            gameToExit.isHost ? "play:newGame.endGameMessage" : "play:newGame.leaveGameMessage",
          )}
          confirmText={translate(
            gameToExit.isHost ? "play:newGame.endGameConfirm" : "play:newGame.leaveGameConfirm",
          )}
          destructive={gameToExit.isHost}
          busy={exitingGameId === gameToExit.publicId}
          confirmDisabled={!connected?.ready || busy}
          notice={connected?.exitError ? <AlertNote text={connected.exitError} /> : undefined}
          dialogTestID="connected-game-exit-confirmation"
          confirmTestID="confirm-connected-game-exit"
          cancelTestID="cancel-connected-game-exit"
          onConfirm={() => void confirmExit()}
          onClose={() => setGameToExit(undefined)}
        />
      ) : null}
      {appearanceSeat !== undefined && appearanceDraft ? (
        <DialogCard
          visible={paywall === "closed"}
          onDismissed={paywall === "waitingForDismiss" ? () => void presentPaywall() : undefined}
          origin={appearanceOrigin}
          onClose={closeAppearancePicker}
          backdropTestID="local-appearance-backdrop"
          backdropAccessibilityLabel={translate("play:newGame.closeAppearancePicker")}
          dialogTestID="local-appearance-dialog"
          accessibilityViewIsModal
        >
          <Text
            preset="subheading"
            tx="play:newGame.appearanceTitle"
            txOptions={{ name: players[appearanceSeat].name }}
          />
          <AppearancePicker
            value={appearanceDraft}
            taken={seatAppearances
              .slice(0, playerCount)
              .filter((_, index) => index !== appearanceSeat)}
            proShapes={PRO_MARK_SHAPES}
            proLocked={!billing.isCountPro}
            foil={billing.isFoil}
            onLockedPress={pro.request}
            teamColor={
              teams
                ? {
                    onPress: () => {
                      closeAppearancePicker()
                      setOpenTeam(teams.findIndex((members) => members.includes(appearanceSeat)))
                    },
                  }
                : undefined
            }
            onChange={setAppearanceDraft}
          />
          {pro.explaining ? <ProSignInNote onSignIn={signInForPro} /> : null}
          <View style={themed($dialogActions)}>
            <Button
              tx="common:cancel"
              style={themed($dialogButton)}
              onPress={closeAppearancePicker}
            />
            <Button
              testID="save-local-appearance-button"
              tx="common:save"
              preset="primary"
              style={themed($dialogButton)}
              onPress={saveAppearance}
            />
          </View>
        </DialogCard>
      ) : null}
      {pickingHostSeat && localGame && localConnect ? (
        <DialogCard
          visible
          onClose={() => setPickingHostSeat(false)}
          dialogTestID="host-seat-dialog"
          accessibilityViewIsModal
        >
          <Text preset="subheading" tx="play:newGame.hostSeatTitle" />
          <Text size="xs" tx="play:newGame.hostSeatMessage" tone="dim" />
          {localGame.players.map((player) => (
            <Button
              key={player.id}
              testID={`host-seat-${player.seat + 1}`}
              text={player.name}
              disabled={localConnect.busy}
              onPress={() => localConnect.publish(player.id)}
            />
          ))}
          {localConnect.error ? <AlertNote text={localConnect.error} /> : null}
          <Button tx="common:cancel" onPress={() => setPickingHostSeat(false)} />
        </DialogCard>
      ) : null}
      {endingMatch && localMatchEnd ? (
        <LocalMatchEndDialog
          game={localMatchEnd.game}
          onClose={() => setEndingMatch(false)}
          onEnd={(outcomes) => {
            localMatchEnd.onEnd(outcomes)
            setEndingMatch(false)
          }}
        />
      ) : null}
      {ending && !ending.afterSheet && localGame && onEndLocal && !matchBlocks ? (
        <LocalGameEndDialog
          game={localGame}
          onClose={() => setEnding(undefined)}
          onEnd={(result) => endThenStart(() => onEndLocal(result))}
          onAbandon={onAbandonLocal ? () => endThenStart(onAbandonLocal) : undefined}
        />
      ) : null}
    </View>
  )
}

function tabsLockedTo(tabs: readonly GameTab[], selectedId: string) {
  return tabs.flatMap((tab) => {
    const types = tab.types.filter((type) => type.id === selectedId)
    return types.length ? [{ ...tab, types }] : []
  })
}

const CONTENT_MAX_WIDTH = 720
const $root: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.surface })
const $form: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const FOOTER_ROW_MAX_FONT_SCALE = 1.4
const FOOTER_MAX_FONT_SCALE = 2
const $footerButtonText = { maxFontSizeMultiplier: FOOTER_MAX_FONT_SCALE }
const $footer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.surface,
  paddingTop: spacing.sm,
  paddingHorizontal: 0,
})
const $footerContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: CONTENT_MAX_WIDTH,
  alignSelf: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.md,
})
const $footerActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $footerAction: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $footerStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $statusRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  height: BOTTOM_LINK_HEIGHT,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $secondaryRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.xs,
})
const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.textDim,
})
const $resumeAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexShrink: 1,
  paddingHorizontal: spacing.md,
})
const $resumeText: ThemedStyle<TextStyle> = ({ colors }) => ({
  flexShrink: 1,
  color: colors.tint,
  textAlign: "center",
})

const $setupHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: CONTENT_MAX_WIDTH,
  alignSelf: "center",
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.md,
  gap: spacing.md,
})
