import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { Platform, ScrollView, TouchableOpacity, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import {
  $dialogActions,
  $dialogButton,
  DialogCard,
  type DialogOrigin,
} from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { PlayerLayoutPicker } from "@/components/PlayerLayoutPicker"
import { PlayerMark } from "@/components/PlayerMark"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { ValueField } from "@/components/ValueField"
import type { NextPageState } from "@/features/async/remoteState"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { AppearancePicker } from "@/features/connected/AppearancePicker"
import type { ResumableGame } from "@/features/connected/connectedCopy"
import { ConnectedGameRow } from "@/features/connected/ConnectedGameRow"
import {
  hasLocalGameStarted,
  matchContextLabel,
  MAX_PLAYER_NAME_LENGTH,
  meSeatOf,
  PLAYER_COLORS,
  validatePlayerNames,
  validateStartingLife,
} from "@/features/game/domain"
import { LocalGameEndDialog } from "@/features/game/LocalGameEndDialog"
import { LocalMatchEndDialog } from "@/features/game/LocalMatchEndDialog"
import type { LocalGameAccountInput, LocalSettings } from "@/features/game/localPersistence"
import {
  playerGridLayoutForCount,
  type PlayerGridLayoutVariant,
} from "@/features/game/playerLayouts"
import {
  counterHeading,
  defaultStartingLife,
  isPlaySystemId,
  NO_PLAY_SYSTEM,
  playFormatOptions,
  playSystemChoices,
  playSystemFormat,
  playSystemRules,
  type PlaySystemId,
} from "@/features/game/playSystems"
import {
  defaultRoundClockMinutes,
  ROUND_CLOCK_MINUTES,
  type RoundClockSetup,
} from "@/features/game/roundClock"
import type {
  LocalGame,
  LocalGameResult,
  MatchSeatOutcome,
  NewPlayerInput,
  PlayerId,
} from "@/features/game/types"
import type { LanSetup } from "@/features/lan/lanGame"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import {
  PLAYER_MARK_SHAPES,
  PRO_MARK_SHAPES,
  resolveAppearance,
  shapeForSeat,
  withoutProMarks,
  type PlayerAppearance,
} from "../../convex/lib/appearance"
import { MATCH_BEST_OF, type MatchBestOf } from "../../convex/lib/matchResults"
import { nameFailsGate } from "../../convex/lib/nameFilter"
import { isTreacheryPlayerCount, type GameVariant } from "../../convex/lib/treachery"

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
  host: (setup: {
    playerCount: number
    startingLife: number
    ruleset: string
    system?: PlaySystemId
    format?: string
    variant?: GameVariant
    deckRequired: boolean
    layout: PlayerGridLayoutVariant
    lifeStep: number
  }) => void
  exitGame: (game: ResumableGame) => Promise<boolean>
}

export interface DeckChoice {
  versionId: string
  name: string
  system: string
  format: string
}

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
    },
  ) => void
  connected?: ConnectedHostFeed
  initialGame?: LocalGame
  localGame?: LocalGame
  account?: LocalAccountSetup
  onResumeLocal?: () => void
  onEndLocal?: (result: LocalGameResult) => void
  onAbandonLocal?: () => void
  onSavePlayers?: (players: NewPlayerInput[], account?: LocalGameAccountInput) => void
  joinContent?: ReactNode
  onResumeConnected?: (game: ResumableGame) => void
  onNearby?: (setup: LanSetup) => void
  /** Publishes the running local game as a connected game. Absent when the flow is unavailable. */
  localConnect?: LocalConnectFeed
  localMatchEnd?: { game: LocalGame; onEnd: (outcomes: MatchSeatOutcome[]) => void }
}

export interface LocalConnectFeed {
  /** Set when the account gate has to be cleared first, mirroring `ConnectedHostFeed`. */
  access?: { label: string; request: () => void }
  ready?: boolean
  busy?: boolean
  error?: string
  publish: (hostPlayerId: PlayerId) => void
}

const PLAYER_COUNTS = [2, 3, 4, 5, 6]
const TREACHERY_MIN_SEATS = 4
const MAX_SEATS = 6
const LIFE_STEP_OPTIONS = [1, 5, 10, 50, 100, 500, 1000] as const
const CLOCK_MODES = [
  { id: "off", labelTx: "play:newGame.clockOff" },
  { id: "countdown", labelTx: "play:newGame.clockCountdown" },
  { id: "stopwatch", labelTx: "play:newGame.clockStopwatch" },
] as const
type ClockMode = (typeof CLOCK_MODES)[number]["id"]

export function NewGameScreen({
  defaults,
  mode,
  onModeChange,
  onBack,
  onStartLocal,
  connected,
  initialGame,
  localGame,
  account,
  onResumeLocal,
  onEndLocal,
  onAbandonLocal,
  onSavePlayers,
  joinContent,
  onResumeConnected,
  onNearby,
  localConnect,
  localMatchEnd,
}: NewGameScreenProps) {
  const {
    themed,
    theme: { colors, spacing },
  } = useAppTheme()
  const { bottom } = useSafeAreaInsets()
  const { fontScale } = useWindowDimensions()
  const [playerCount, setPlayerCount] = useState(
    initialGame?.players.length ?? defaults.defaultPlayerCount,
  )
  const [layout, setLayout] = useState<PlayerGridLayoutVariant>(initialGame?.layout ?? "auto")
  const [names, setNames] = useState<string[]>(() =>
    Array.from({ length: MAX_SEATS }, (_, index) => initialGame?.players[index]?.name ?? ""),
  )
  const [appearances, setAppearances] = useState<PlayerAppearance[]>(() =>
    Array.from({ length: MAX_SEATS }, (_, index) => ({
      color: initialGame?.players[index]?.color ?? PLAYER_COLORS[index],
      shape:
        initialGame?.players[index]?.shape ??
        shapeForSeat(index + 1, initialGame?.players[index] ? undefined : PLAYER_MARK_SHAPES),
    })),
  )
  const auth = useAuthAccess()
  const billing = useRevenueCat()
  // why: until RevenueCat answers, a Pro player's saved marks look unpaid; trading them then would save the downgrade.
  const confirmedFree =
    (auth.isLoaded && !auth.isSignedIn) || (billing.customerInfo !== null && !billing.isCountPro)
  const seatAppearances = useMemo(
    () => (confirmedFree ? withoutProMarks(appearances) : appearances),
    [appearances, confirmedFree],
  )
  // why: on iOS the paywall can only present once the picker's modal has finished dismissing.
  const [paywall, setPaywall] = useState<"closed" | "waitingForDismiss" | "open">("closed")
  const [appearanceSeat, setAppearanceSeat] = useState<number>()
  const [appearanceDraft, setAppearanceDraft] = useState<PlayerAppearance>()
  const [appearanceOrigin, setAppearanceOrigin] = useState<DialogOrigin>()
  const initialSystem = initialGame ? initialGame.system : defaults.defaultSystem
  const [system, setSystem] = useState<PlaySystemId | undefined>(initialSystem)
  const [format, setFormat] = useState<string | undefined>(
    () =>
      initialGame?.format ??
      (initialSystem ? playSystemFormat(initialSystem, defaults.defaultFormat) : undefined),
  )
  const [startingLife, setStartingLife] = useState(
    initialGame?.startingLife ?? defaults.defaultStartingLife,
  )
  const [deckRequired, setDeckRequired] = useState(false)
  const [treacheryChosen, setTreacheryChosen] = useState(false)
  const [lifeStep, setLifeStep] = useState(
    initialGame?.lifeStep ?? playSystemRules(initialSystem).counter.tapStep,
  )
  const counter = playSystemRules(system).counter
  const [meSeat, setMeSeat] = useState<number | undefined>(() =>
    initialGame && (initialGame.account || hasLocalGameStarted(initialGame))
      ? meSeatOf(initialGame)
      : account?.defaultMeSeat,
  )
  const [deck, setDeck] = useState<Pick<DeckChoice, "versionId" | "name"> | undefined>(() => {
    const chosen = initialGame?.account
    return chosen?.deckVersionId
      ? { versionId: chosen.deckVersionId, name: chosen.deckName ?? "Deck" }
      : undefined
  })
  // why: a sign-out or account switch while this screen stays mounted must not hand the previous account's seat and deck to the new one.
  const seenOwnerId = useRef(account?.ownerId)
  useEffect(() => {
    if (seenOwnerId.current === account?.ownerId) return
    seenOwnerId.current = account?.ownerId
    setMeSeat(account?.defaultMeSeat)
    setDeck(undefined)
  }, [account?.defaultMeSeat, account?.ownerId])
  const [matchOn, setMatchOn] = useState(Boolean(initialGame?.match))
  const [chosenBestOf, setChosenBestOf] = useState<MatchBestOf | undefined>(
    initialGame?.match?.bestOf,
  )
  const [clockMode, setClockMode] = useState<ClockMode>(initialGame?.clock?.setup.mode ?? "off")
  const initialClock = initialGame?.clock?.setup
  const [chosenClockMinutes, setChosenClockMinutes] = useState(
    initialClock?.mode === "countdown" ? initialClock.minutes : undefined,
  )
  const [showOptions, setShowOptions] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [endingLocal, setEndingLocal] = useState(false)
  const [playerSaveError, setPlayerSaveError] = useState<string>()
  const [gameToExit, setGameToExit] = useState<ResumableGame>()
  const [exitingGameId, setExitingGameId] = useState<string>()
  const [connectedAction, setConnectedAction] = useState("host")
  const [pickingHostSeat, setPickingHostSeat] = useState(false)
  const connectedMode = mode === "connected"
  const treacheryAvailable = connectedMode && system === "mtg"
  const treachery = treacheryAvailable && treacheryChosen
  const joining = connectedMode && connectedAction === "join" && Boolean(joinContent)
  const preparing = connectedMode && Boolean(connected?.status) && !connected?.ready
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
  const effectiveMeSeat = meSeat !== undefined && meSeat < playerCount ? meSeat : undefined
  const matchBestOf = matchOn
    ? (chosenBestOf ?? (format === "commander" || playerCount > 2 ? 1 : 3))
    : undefined
  const clockMinutes = chosenClockMinutes ?? defaultRoundClockMinutes(system, matchBestOf)
  const clockSetup: RoundClockSetup | undefined =
    clockMode === "off"
      ? undefined
      : clockMode === "countdown"
        ? { mode: "countdown", minutes: clockMinutes }
        : { mode: "stopwatch" }
  const matchLocked = Boolean(
    initialGame?.match && (initialGame.match.gameNumber > 1 || hasLocalGameStarted(initialGame)),
  )
  const deckList = account?.decks === "unavailable" ? undefined : account?.decks
  const deckChoices =
    deckList?.filter((choice) => choice.system === system && choice.format === format) ?? []
  const accountInput = useMemo<LocalGameAccountInput | undefined>(
    () =>
      account
        ? {
            ownerId: account.ownerId,
            meSeat: effectiveMeSeat,
            ...(deck ? { deckVersionId: deck.versionId, deckName: deck.name } : {}),
          }
        : undefined,
    [account, deck, effectiveMeSeat],
  )
  const valid = connectedMode
    ? validLife && Boolean(connected?.ready || connected?.access) && !connected?.blockedReason
    : validLife && nameValidation.valid && !localGame
  const busy = connectedMode && Boolean(connected?.busy)
  const connectedGames = connected?.activeGames ?? []
  const localGameBlocksStart = Boolean(localGame)
  const matchBlocks = Boolean(localGame?.match)
  const [endingMatch, setEndingMatch] = useState(false)
  const connectedBlocksLocal =
    !connectedMode && Boolean(connected?.ready) && connectedGames.length > 0
  const hostedGame = connectedMode ? connectedGames.find((game) => game.isHost) : undefined
  const singleBlockingConnected =
    connectedBlocksLocal && connectedGames.length === 1 ? connectedGames[0] : undefined
  const gameBlocksStart = localGameBlocksStart || connectedBlocksLocal || Boolean(hostedGame)
  const resumeGame = connectedMode && connectedGames.length === 1 ? hostedGame : undefined
  const hostedResumable =
    connectedMode || !onResumeConnected ? undefined : connectedGames.find((game) => game.isHost)
  /** Only a running local game can be handed to the server; a connected one is already there. */
  const canConnectLocal = Boolean(localConnect) && !connectedMode && localGameBlocksStart
  const showNearby = connectedMode && Boolean(onNearby)
  const footerRow =
    (canConnectLocal || Boolean(localMatchEnd) || showNearby) &&
    fontScale <= FOOTER_ROW_MAX_FONT_SCALE
  const directResume =
    localGameBlocksStart || Boolean(resumeGame && connected?.ready && !connected.error)

  const hasStatusDetails = connectedMode
    ? Boolean(connectedGames.length || connected?.blockedReason || connected?.error)
    : Boolean(localGame) || connectedBlocksLocal
  const statusText = connectedMode
    ? directResume
      ? translate("play:newGame.resumeCurrentGame")
      : (connected?.error ??
        connected?.blockedReason ??
        (connectedGames.length
          ? translate("play:newGame.gamesInProgress")
          : preparing && showPreparation
            ? connected?.status
            : ""))
    : localGame?.match
      ? translate("play:newGame.matchStatus", {
          context: matchContextLabel(localGame),
          bestOf: localGame.match.bestOf,
        })
      : localGame
        ? translate("play:newGame.resumeCurrentGame")
        : connectedBlocksLocal
          ? singleBlockingConnected
            ? translate("play:newGame.resumeCurrentGame")
            : translate("play:newGame.gamesInProgress")
          : ""

  function submit() {
    if (!valid || busy) return
    if (connectedMode && connected?.access) {
      connected.access.request()
      return
    }
    const setup = {
      layout,
      lifeStep,
      ...(system && format ? { system, format } : {}),
    }
    if (connectedMode)
      connected?.host({
        playerCount,
        startingLife,
        ruleset: format ?? NO_PLAY_SYSTEM,
        deckRequired,
        ...(treachery ? { variant: "treachery" as const } : {}),
        ...setup,
      })
    else
      onStartLocal(players, startingLife, {
        ...setup,
        account: accountInput,
        ...(matchBestOf ? { match: { bestOf: matchBestOf } } : {}),
        ...(clockSetup ? { clock: clockSetup } : {}),
      })
  }

  function toggleMatch(on: boolean) {
    setMatchOn(on)
    setChosenBestOf(undefined)
  }

  function chooseSystem(value: string) {
    const next = isPlaySystemId(value) ? value : undefined
    const nextCounter = playSystemRules(next).counter
    setSystem(next)
    setTreacheryChosen(false)
    setFormat(next ? playSystemFormat(next) : undefined)
    setStartingLife(defaultStartingLife(next, undefined, playerCount))
    setLifeStep(nextCounter.tapStep)
    setDeck(undefined)
  }

  function chooseFormat(value: string | undefined) {
    if (startingLife === defaultStartingLife(system, format, playerCount))
      setStartingLife(defaultStartingLife(system, value, playerCount))
    setFormat(value)
    setDeck(undefined)
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
    const seat = value === undefined ? undefined : Number(value)
    setMeSeat(seat)
    if (seat === undefined) setDeck(undefined)
    if (accountInput)
      savePlayers(seatAppearances, {
        ...accountInput,
        meSeat: seat,
        ...(seat === undefined ? { deckVersionId: undefined, deckName: undefined } : {}),
      })
  }

  function chooseDeck(versionId: string | undefined) {
    const choice = deckChoices.find((candidate) => candidate.versionId === versionId)
    setDeck(choice)
    if (accountInput)
      savePlayers(seatAppearances, {
        ...accountInput,
        deckVersionId: choice?.versionId,
        deckName: choice?.name,
      })
  }

  async function confirmExit() {
    if (!gameToExit || !connected?.exitGame) return
    setExitingGameId(gameToExit.publicId)
    const exited = await connected.exitGame(gameToExit)
    setExitingGameId(undefined)
    if (exited) setGameToExit(undefined)
  }

  function chooseTreachery(on: boolean) {
    setTreacheryChosen(on)
    if (on && !isTreacheryPlayerCount(playerCount)) choosePlayerCount(TREACHERY_MIN_SEATS)
  }

  function choosePlayerCount(value: number) {
    if (!isTreacheryPlayerCount(value)) setTreacheryChosen(false)
    if (value > playerCount)
      setAppearances((current) => {
        const next = confirmedFree ? withoutProMarks(current) : [...current]
        for (let index = playerCount; index < value; index += 1)
          next[index] = resolveAppearance({
            preferred: current[index],
            taken: next.slice(0, index),
            seat: index + 1,
            shapes: confirmedFree ? undefined : [...PLAYER_MARK_SHAPES, ...PRO_MARK_SHAPES],
          })
        return next
      })
    if (startingLife === defaultStartingLife(system, format, playerCount))
      setStartingLife(defaultStartingLife(system, format, value))
    setPlayerCount(value)
    setLayout((current) => playerGridLayoutForCount(value, current))
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
  }

  async function presentPaywall() {
    setPaywall("open")
    await billing.presentPaywall()
    setPaywall("closed")
  }

  function openPaywall() {
    if (!auth.isSignedIn) {
      closeAppearancePicker()
      auth.openAuth()
    } else if (Platform.OS === "ios") setPaywall("waitingForDismiss")
    else void presentPaywall()
  }

  function saveAppearance() {
    if (appearanceSeat === undefined || !appearanceDraft) return
    const drafted = seatAppearances.map((appearance, index) =>
      index === appearanceSeat ? appearanceDraft : appearance,
    )
    const next = confirmedFree ? withoutProMarks(drafted) : drafted
    setAppearances(next)
    savePlayers(next)
    closeAppearancePicker()
  }

  return (
    <View style={[themed($root), $styles.flex1]}>
      <View style={themed($setupHeader)}>
        <Header
          titleTx={onSavePlayers ? "play:newGame.setupTitle" : "play:newGame.newTitle"}
          leftTx="common:back"
          backgroundColor={colors.surface}
          onLeftPress={onBack}
        />
        <SegmentedControl
          testID="mode"
          accessibilityLabel={translate("play:newGame.connectionLabel")}
          segments={[
            { id: "local", label: translate("play:newGame.onThisDevice") },
            { id: "connected", label: translate("play:newGame.connected") },
          ]}
          selectedId={mode}
          onSelect={(value) => onModeChange(value === "connected" ? "connected" : "local")}
        />

        {connectedMode && joinContent ? (
          <SegmentedControl
            testID="connected-action"
            accessibilityLabel={translate("play:newGame.hostOrJoin")}
            segments={[
              { id: "host", label: translate("play:newGame.host") },
              { id: "join", label: translate("play:newGame.join") },
            ]}
            selectedId={connectedAction}
            onSelect={setConnectedAction}
          />
        ) : null}
      </View>
      {joining ? (
        joinContent
      ) : (
        <>
          <Screen preset="scroll" contentInset="standard" contentContainerStyle={themed($form)}>
            {hostedResumable ? (
              <View style={themed($section)}>
                <Button
                  testID="resume-hosted-connected-button"
                  tx="play:newGame.resumeHostedGame"
                  onPress={() => onResumeConnected?.(hostedResumable)}
                />
              </View>
            ) : null}
            <View style={themed($section)}>
              <Text tx="play:newGame.system" preset="subheading" accessibilityRole="header" />
              <SegmentedControl
                testID="play-system"
                accessibilityLabel={translate("play:newGame.gameSystem")}
                segments={playSystemChoices()}
                selectedId={system ?? NO_PLAY_SYSTEM}
                onSelect={chooseSystem}
              />
              {system ? (
                <SelectField
                  testID="play-format"
                  label={translate("play:newGame.format")}
                  value={format}
                  options={playFormatOptions(system)}
                  onSelect={chooseFormat}
                />
              ) : null}
              {treacheryAvailable ? (
                <SegmentedControl
                  testID="variant"
                  accessibilityLabel="Variant"
                  segments={[
                    { id: "standard", label: "Standard" },
                    { id: "treachery", label: "Treachery" },
                  ]}
                  selectedId={treachery ? "treachery" : "standard"}
                  onSelect={(value) => chooseTreachery(value === "treachery")}
                />
              ) : null}
            </View>

            <View style={themed($valueGrid)}>
              <View style={themed($playerValue)}>
                <ValueField
                  testID="player-count"
                  label={
                    connectedMode
                      ? translate("play:newGame.seats")
                      : translate("play:newGame.players")
                  }
                  value={playerCount}
                  min={treachery ? TREACHERY_MIN_SEATS : PLAYER_COUNTS[0]}
                  max={PLAYER_COUNTS[PLAYER_COUNTS.length - 1]}
                  onChange={choosePlayerCount}
                />
              </View>
              <View style={themed($counterValue)}>
                <ValueField
                  testID="starting-counter"
                  label={counterHeading(system)}
                  value={startingLife}
                  min={1}
                  max={counter.maxStartingValue}
                  longStep={counter.longPressStep}
                  step={lifeStep}
                  onChange={setStartingLife}
                />
              </View>
            </View>

            {connectedMode ? (
              <View style={themed($section)}>
                <Text tx="play:newGame.decks" preset="subheading" accessibilityRole="header" />
                <SegmentedControl
                  testID="deck-requirement"
                  accessibilityLabel={translate("play:newGame.deckRequirement")}
                  segments={[
                    { id: "optional", label: translate("play:newGame.optional") },
                    { id: "required", label: translate("play:newGame.required") },
                  ]}
                  selectedId={deckRequired ? "required" : "optional"}
                  onSelect={(value) => setDeckRequired(value === "required")}
                />
              </View>
            ) : null}

            {!connectedMode && !localGame ? (
              <View style={themed($section)}>
                <Text tx="play:newGame.match" preset="subheading" accessibilityRole="header" />
                <SegmentedControl
                  testID="match-mode"
                  accessibilityLabel={translate("play:newGame.match")}
                  segments={[
                    { id: "off", label: translate("play:newGame.singleGame") },
                    { id: "on", label: translate("play:newGame.bestOf") },
                  ]}
                  selectedId={matchBestOf ? "on" : "off"}
                  onSelect={(value) => toggleMatch(value === "on")}
                />
                {matchBestOf ? (
                  <SegmentedControl
                    testID="match-best-of"
                    accessibilityLabel={translate("play:newGame.bestOf")}
                    segments={MATCH_BEST_OF.map((bestOf) => ({
                      id: String(bestOf),
                      label: translate("play:newGame.bestOfCount", { bestOf }),
                    }))}
                    selectedId={String(matchBestOf)}
                    onSelect={(value) =>
                      setChosenBestOf(MATCH_BEST_OF.find((bestOf) => String(bestOf) === value))
                    }
                  />
                ) : null}
              </View>
            ) : null}

            {!connectedMode && !localGame ? (
              <View style={themed($section)}>
                <Text tx="play:newGame.clock" preset="subheading" accessibilityRole="header" />
                <SegmentedControl
                  testID="clock-mode"
                  accessibilityLabel={translate("play:newGame.clock")}
                  segments={CLOCK_MODES.map(({ id, labelTx }) => ({
                    id,
                    label: translate(labelTx),
                  }))}
                  selectedId={clockMode}
                  onSelect={(value) => {
                    const mode = CLOCK_MODES.find(({ id }) => id === value)?.id
                    if (mode) setClockMode(mode)
                  }}
                />
                {clockMode === "countdown" ? (
                  <ValueField
                    testID="clock-minutes"
                    label={translate("play:newGame.minutesLeft")}
                    value={clockMinutes}
                    min={ROUND_CLOCK_MINUTES.min}
                    max={ROUND_CLOCK_MINUTES.max}
                    longStep={ROUND_CLOCK_MINUTES.step}
                    onChange={setChosenClockMinutes}
                  />
                ) : null}
              </View>
            ) : null}

            <Button
              testID="setup-options"
              tx={showOptions ? "play:newGame.hideOptions" : "play:newGame.showOptions"}
              accessibilityState={{ expanded: showOptions }}
              onPress={() => setShowOptions((value) => !value)}
            />
            {showOptions ? (
              <View style={themed($statusDetails)}>
                <View style={themed($section)}>
                  <SelectField
                    testID="life-step"
                    label={translate("play:newGame.changeBy")}
                    value={String(lifeStep)}
                    options={LIFE_STEP_OPTIONS.map((step) => ({
                      id: String(step),
                      label: String(step),
                    }))}
                    onSelect={(value) => {
                      const next = LIFE_STEP_OPTIONS.find((step) => String(step) === value)
                      if (next) setLifeStep(next)
                    }}
                  />
                </View>

                <View style={themed($section)}>
                  <Text tx="play:newGame.layout" preset="subheading" accessibilityRole="header" />
                  <PlayerLayoutPicker
                    playerCount={playerCount}
                    value={layout}
                    onChange={setLayout}
                  />
                </View>
              </View>
            ) : null}

            {!connectedMode ? (
              <View style={themed($section)}>
                <Text tx="play:playerNames" preset="subheading" accessibilityRole="header" />
                <View style={themed($nameList)}>
                  {players.map((player, index) => (
                    <View key={index} style={themed($nameRow)}>
                      <TouchableOpacity
                        testID={`player-appearance-${index + 1}`}
                        accessibilityRole="button"
                        accessibilityLabel={translate("play:newGame.changeAppearance", {
                          name: player.name,
                        })}
                        activeOpacity={0.75}
                        style={themed($appearanceButton)}
                        onPress={(event) => openAppearancePicker(index, event)}
                      >
                        <PlayerMark
                          seatNumber={index + 1}
                          shape={player.shape}
                          color={player.color}
                          size={32}
                        />
                      </TouchableOpacity>
                      <TextField
                        testID={`player-name-${index + 1}`}
                        value={names[index]}
                        placeholder={defaultName(index)}
                        accessibilityLabel={translate("play:newGame.nameForPlayer", {
                          seat: index + 1,
                        })}
                        maxLength={MAX_PLAYER_NAME_LENGTH}
                        status={nameValidation.errors[index] ? "error" : undefined}
                        helper={
                          nameValidation.errors[index] ??
                          (nameFailsGate(names[index])
                            ? translate("play:newGame.nameGateHelper", { name: defaultName(index) })
                            : undefined)
                        }
                        containerStyle={themed($nameField)}
                        onBlur={() => savePlayers()}
                        onChangeText={(value) =>
                          setNames((current) =>
                            current.map((name, i) => (i === index ? value : name)),
                          )
                        }
                      />
                    </View>
                  ))}
                </View>
                {account ? (
                  <View style={themed($accountSeat)}>
                    <SelectField
                      testID="me-seat"
                      label={translate("play:newGame.thisIsMe")}
                      value={effectiveMeSeat === undefined ? undefined : String(effectiveMeSeat)}
                      placeholder={translate("play:newGame.noSeat")}
                      clearLabel={translate("play:newGame.noSeat")}
                      disabled={matchLocked}
                      options={players.map((player, index) => ({
                        id: String(index),
                        label: player.name,
                      }))}
                      onSelect={chooseMeSeat}
                    />
                    {effectiveMeSeat !== undefined && system ? (
                      <SelectField
                        testID="me-deck"
                        label={translate("play:newGame.yourDeck")}
                        value={deck?.versionId}
                        placeholder={
                          account.decks === "unavailable"
                            ? translate("play:newGame.decksUnavailable")
                            : account.decks === undefined
                              ? translate("play:newGame.loadingDecks")
                              : deckChoices.length === 0
                                ? translate("play:newGame.noMatchingDecks")
                                : translate("play:newGame.noDeck")
                        }
                        clearLabel={translate("play:newGame.noDeck")}
                        disabled={matchLocked || (deckList === undefined && !deck)}
                        options={[
                          ...(deck &&
                          !deckChoices.some((choice) => choice.versionId === deck.versionId)
                            ? [{ id: deck.versionId, label: deck.name }]
                            : []),
                          ...deckChoices.map((choice) => ({
                            id: choice.versionId,
                            label: choice.name,
                          })),
                        ]}
                        onSelect={chooseDeck}
                      />
                    ) : null}
                  </View>
                ) : null}
                {playerSaveError ? <Text accessibilityRole="alert" text={playerSaveError} /> : null}
              </View>
            ) : null}
          </Screen>
          <View style={[themed($footer), { paddingBottom: Math.max(bottom, spacing.sm) }]}>
            <View style={themed($footerContent)}>
              <View style={themed(footerRow ? $footerActions : $footerStack)}>
                <Button
                  testID={connectedMode ? "host-connected-button" : "start-game-button"}
                  text={
                    gameBlocksStart
                      ? matchBlocks
                        ? translate("play:newGame.continueMatch")
                        : translate("play:newGame.endCurrentGame")
                      : connectedMode
                        ? (connected?.access?.label ??
                          (busy
                            ? translate("play:newGame.working")
                            : translate("play:newGame.hostLobby")))
                        : undefined
                  }
                  tx={connectedMode || gameBlocksStart ? undefined : "play:startGame"}
                  preset="reversed"
                  TextProps={$footerButtonText}
                  style={[
                    footerRow && themed($footerAction),
                    gameBlocksStart && themed($endCurrentButton),
                  ]}
                  textStyle={gameBlocksStart ? themed($endCurrentButtonText) : undefined}
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
                      : connectedMode
                        ? translate("play:newGame.hostLobbyHint")
                        : translate("play:newGame.startGameHint")
                  }
                  onPress={
                    localGameBlocksStart
                      ? matchBlocks
                        ? onResumeLocal
                        : () => setEndingLocal(true)
                      : hostedGame
                        ? () => setGameToExit(hostedGame)
                        : singleBlockingConnected
                          ? () => setGameToExit(singleBlockingConnected)
                          : connectedBlocksLocal
                            ? () => setShowStatus(true)
                            : submit
                  }
                />
                {showNearby ? (
                  <Button
                    testID="nearby-game-button"
                    tx="play:newGame.nearby"
                    TextProps={$footerButtonText}
                    style={footerRow ? themed($footerAction) : undefined}
                    accessibilityHint={translate("play:newGame.nearbyHint")}
                    onPress={() =>
                      onNearby?.({
                        playerCount,
                        startingLife,
                        lifeStep,
                        ruleset: format ?? NO_PLAY_SYSTEM,
                        ...(system && format ? { system, format } : {}),
                      })
                    }
                  />
                ) : null}
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
                    preset="reversed"
                    style={footerRow ? themed($footerAction) : undefined}
                    disabled={localConnect?.busy || localConnect?.ready === false}
                    accessibilityHint={translate("play:newGame.connectHint")}
                    onPress={() =>
                      localConnect?.access
                        ? localConnect.access.request()
                        : setPickingHostSeat(true)
                    }
                  />
                ) : null}
              </View>
              {/* why: connected status arrives late, so its row stays reserved; an empty local row is dead space above the home indicator. */}
              {connectedMode || statusText ? (
                <TouchableOpacity
                  testID="setup-status"
                  accessible={Boolean(statusText)}
                  accessibilityRole={hasStatusDetails ? "button" : "text"}
                  accessibilityLabel={statusText || translate("play:newGame.gameStatus")}
                  accessibilityHint={
                    directResume
                      ? translate("play:newGame.resumeHint")
                      : hasStatusDetails
                        ? translate("play:newGame.statusDetailsHint")
                        : undefined
                  }
                  disabled={!hasStatusDetails}
                  style={[
                    themed($statusRow),
                    (directResume || (connectedMode && hasStatusDetails)) && themed($resumeAction),
                  ]}
                  onPress={
                    localGameBlocksStart
                      ? onResumeLocal
                      : directResume && resumeGame
                        ? () => onResumeConnected?.(resumeGame)
                        : singleBlockingConnected && onResumeConnected
                          ? () => onResumeConnected(singleBlockingConnected)
                          : () => setShowStatus(true)
                  }
                >
                  <Text
                    testID={preparing && showPreparation ? "connected-host-preparation" : undefined}
                    accessibilityLiveRegion="polite"
                    size="xs"
                    numberOfLines={1}
                    maxFontSizeMultiplier={FOOTER_MAX_FONT_SCALE}
                    text={statusText}
                    style={themed(
                      directResume || (connectedMode && hasStatusDetails)
                        ? $resumeText
                        : $statusText,
                    )}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </>
      )}
      <DialogCard
        visible={showStatus}
        onClose={() => setShowStatus(false)}
        dialogTestID="setup-status-dialog"
        accessibilityViewIsModal
      >
        <ScrollView contentContainerStyle={themed($statusDetails)}>
          {connectedMode && connected?.blockedReason ? (
            <Text
              accessibilityRole="alert"
              size="xs"
              text={connected.blockedReason}
              style={themed($footerStatus)}
            />
          ) : null}
          {connectedMode && connected?.error ? (
            <View style={themed($connectedError)}>
              <Text
                accessibilityRole="alert"
                size="xs"
                text={connected.error}
                style={themed($footerNote)}
              />
              {connected.retry ? (
                <Button
                  testID="retry-connected-host-preparation"
                  tx="common:tryAgain"
                  style={themed($retryConnected)}
                  onPress={connected.retry}
                />
              ) : null}
            </View>
          ) : null}
          {connectedMode &&
          connected &&
          !connected.ready &&
          !connected.error &&
          connected.retry &&
          connected.blockedReason &&
          !connected.access ? (
            <Button tx="play:newGame.retryConnection" onPress={connected.retry} />
          ) : null}

          {connectedGames.length ? (
            <View style={themed($section)}>
              <Text
                tx="play:newGame.yourConnectedGames"
                preset="subheading"
                accessibilityRole="header"
              />
              {connectedGames.map((game) => (
                <View key={game.publicId} style={themed($connectedGame)}>
                  <ConnectedGameRow
                    game={game}
                    now={Date.now()}
                    onPress={() => onResumeConnected?.(game)}
                  />
                  <TouchableOpacity
                    testID={`${game.isHost ? "end" : "leave"}-connected-${game.publicId}`}
                    accessibilityRole="button"
                    disabled={busy || !connected?.ready}
                    accessibilityState={{ disabled: busy || !connected?.ready }}
                    style={themed($localEndAction)}
                    onPress={() => {
                      setShowStatus(false)
                      setGameToExit(game)
                    }}
                  >
                    <Text
                      tx={
                        game.isHost
                          ? "play:newGame.endGameEllipsis"
                          : "play:newGame.leaveGameEllipsis"
                      }
                      style={themed($footerStatus)}
                    />
                  </TouchableOpacity>
                </View>
              ))}
              {connected?.exitError ? (
                <Text
                  accessibilityRole="alert"
                  style={themed($footerNote)}
                  text={connected.exitError}
                />
              ) : null}
              {connected?.activeGamesNextPage?.status === "available" ? (
                <Button tx="play:newGame.loadMore" onPress={connected.activeGamesNextPage.load} />
              ) : connected?.activeGamesNextPage?.status === "loading" ? (
                <Text size="xs" style={themed($footerStatus)} tx="play:newGame.loadingMoreGames" />
              ) : null}
            </View>
          ) : null}
        </ScrollView>
        <Button tx="common:done" onPress={() => setShowStatus(false)} />
      </DialogCard>
      {gameToExit ? (
        <ConfirmDialog
          visible
          title={translate(
            gameToExit.isHost ? "play:newGame.endGameTitle" : "play:newGame.leaveGameTitle",
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
            onLockedPress={openPaywall}
            onChange={setAppearanceDraft}
          />
          <View style={themed($dialogActions)}>
            <Button
              tx="common:cancel"
              style={themed($dialogButton)}
              onPress={closeAppearancePicker}
            />
            <Button
              testID="save-local-appearance-button"
              tx="common:save"
              preset="reversed"
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
          <Text size="xs" tx="play:newGame.hostSeatMessage" style={themed($footerStatus)} />
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
      {endingLocal && localGame && onEndLocal && !matchBlocks ? (
        <LocalGameEndDialog
          game={localGame}
          onClose={() => setEndingLocal(false)}
          onEnd={(result) => {
            onEndLocal(result)
            setEndingLocal(false)
          }}
          onAbandon={
            onAbandonLocal
              ? () => {
                  onAbandonLocal()
                  setEndingLocal(false)
                }
              : undefined
          }
        />
      ) : null}
    </View>
  )
}

function defaultName(index: number) {
  return `Player ${index + 1}`
}

const CONTENT_MAX_WIDTH = 720
const MIN_NAME_ROW_WIDTH = 280

const $root: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.surface })
const $form: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.md,
  backgroundColor: colors.surface,
})
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $valueGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $playerValue: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $counterValue: ThemedStyle<ViewStyle> = () => ({ flex: 1.45 })
const $nameList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  columnGap: spacing.md,
  rowGap: spacing.sm,
})
const $nameRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: MIN_NAME_ROW_WIDTH,
})
const $connectedError: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $connectedGame: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $retryConnected: ThemedStyle<ViewStyle> = () => ({ minHeight: 40 })
const $nameField: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $accountSeat: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  marginTop: spacing.xs,
})
const $appearanceButton: ThemedStyle<ViewStyle> = () => ({
  width: 44,
  height: 44,
  alignItems: "center",
  justifyContent: "center",
})
const FOOTER_ROW_MAX_FONT_SCALE = 1.4
const FOOTER_MAX_FONT_SCALE = 2
const $footerButtonText = { maxFontSizeMultiplier: FOOTER_MAX_FONT_SCALE }
const $footer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderTopWidth: 1,
  borderTopColor: colors.separator,
  backgroundColor: colors.surface,
  paddingTop: spacing.sm,
})
const $footerContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: CONTENT_MAX_WIDTH,
  alignSelf: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.lg,
})
const $footerActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $footerAction: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $footerStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $footerNote: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
const $footerStatus: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })

const $localEndAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xs,
})
const $statusRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  height: 44,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  flex: 1,
  color: colors.textDim,
})
const $statusDetails: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $resumeAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "center",
  maxWidth: "100%",
  paddingHorizontal: spacing.md,
})
const $resumeText: ThemedStyle<TextStyle> = ({ colors }) => ({
  flexShrink: 1,
  color: colors.tint,
  textAlign: "center",
})

const $endCurrentButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.tint,
})
const $endCurrentButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: accessibleForeground(colors.tint),
})

const $setupHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: CONTENT_MAX_WIDTH,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.md,
  gap: spacing.md,
})
