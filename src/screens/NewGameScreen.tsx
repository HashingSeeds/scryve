import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"
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
import { AppearancePicker } from "@/features/connected/AppearancePicker"
import type { ResumableGame } from "@/features/connected/connectedCopy"
import { ConnectedGameRow } from "@/features/connected/ConnectedGameRow"
import {
  hasLocalGameStarted,
  MAX_PLAYER_NAME_LENGTH,
  meSeatOf,
  PLAYER_COLORS,
  validatePlayerNames,
  validateStartingLife,
} from "@/features/game/domain"
import { LocalGameEndDialog } from "@/features/game/LocalGameEndDialog"
import type { LocalGameAccountInput, LocalSettings } from "@/features/game/localPersistence"
import {
  playerGridLayoutForCount,
  type PlayerGridLayoutVariant,
} from "@/features/game/playerLayouts"
import {
  defaultStartingLife,
  isPlaySystemId,
  NO_PLAY_SYSTEM,
  PLAY_SYSTEM_LIST,
  playSystemFormat,
  playSystemFormats,
  playSystemRules,
  type PlaySystemId,
} from "@/features/game/playSystems"
import type { LocalGame, LocalGameResult, NewPlayerInput, PlayerId } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import {
  PLAYER_MARK_SHAPES,
  resolveAppearance,
  shapeForSeat,
  type PlayerAppearance,
} from "../../convex/lib/appearance"
import { MATCH_BEST_OF, type MatchBestOf } from "../../convex/lib/matchResults"
import { nameFailsGate } from "../../convex/lib/nameFilter"

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

/** why: present only while signed in, so local games can carry the account's seat and deck. */
export interface LocalAccountSetup {
  ownerId: string
  defaultMeSeat?: number
  // why: undefined means the deck list is still loading, which keeps the picker closed.
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
  /** Publishes the running local game as a connected game. Absent when the flow is unavailable. */
  localConnect?: LocalConnectFeed
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
const MAX_SEATS = 6
const LIFE_STEP_OPTIONS = [1, 5, 10, 50, 100, 500, 1000] as const

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
  localConnect,
}: NewGameScreenProps) {
  const {
    themed,
    theme: { colors, spacing },
  } = useAppTheme()
  const { bottom } = useSafeAreaInsets()
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
  const [appearanceSeat, setAppearanceSeat] = useState<number>()
  const [appearanceDraft, setAppearanceDraft] = useState<PlayerAppearance>()
  const [appearanceOrigin, setAppearanceOrigin] = useState<DialogOrigin>()
  const initialSystem = initialGame?.system ?? defaults.defaultSystem
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
  const [lifeStep, setLifeStep] = useState(
    initialGame?.lifeStep ?? playSystemRules(initialSystem).counter.tapStep,
  )
  const counter = playSystemRules(system).counter
  // why: a claimed or running game keeps whatever seat it has, even none; a fresh setup pre-marks one.
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
  // why: the best of follows the table until the player picks one; a pod round is one game, a 1v1 match is three.
  const [chosenBestOf, setChosenBestOf] = useState<MatchBestOf | undefined>(
    initialGame?.match?.bestOf,
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
        color: appearances[index]?.color ?? PLAYER_COLORS[index],
        shape: appearances[index]?.shape ?? shapeForSeat(index + 1, PLAYER_MARK_SHAPES),
      })),
    [appearances, nameValidation.names],
  )
  const effectiveMeSeat = meSeat !== undefined && meSeat < playerCount ? meSeat : undefined
  const matchBestOf = matchOn
    ? (chosenBestOf ?? (format === "commander" || playerCount > 2 ? 1 : 3))
    : undefined
  // why: a match is one deck's record, so once it is under way the seat and deck stay put.
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
  const directResume =
    localGameBlocksStart || Boolean(resumeGame && connected?.ready && !connected.error)

  const hasStatusDetails = connectedMode
    ? Boolean(connectedGames.length || connected?.blockedReason || connected?.error)
    : Boolean(localGame) || connectedBlocksLocal
  const statusText = connectedMode
    ? directResume
      ? "Resume current game"
      : (connected?.error ??
        connected?.blockedReason ??
        (connectedGames.length
          ? "Games in progress"
          : preparing && showPreparation
            ? connected?.status
            : ""))
    : localGame
      ? "Resume current game"
      : connectedBlocksLocal
        ? singleBlockingConnected
          ? "Resume current game"
          : "Games in progress"
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
        ...setup,
      })
    else
      onStartLocal(players, startingLife, {
        ...setup,
        account: accountInput,
        ...(matchBestOf ? { match: { bestOf: matchBestOf } } : {}),
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
    setFormat(next ? playSystemFormat(next) : undefined)
    setStartingLife(defaultStartingLife(next))
    setLifeStep(nextCounter.tapStep)
    setDeck(undefined)
  }

  function chooseFormat(value: string | undefined) {
    if (startingLife === defaultStartingLife(system, format))
      setStartingLife(defaultStartingLife(system, value))
    setFormat(value)
    setDeck(undefined)
  }

  // why: only the seat and deck pickers may claim a game; a rename must not move it to whoever is signed in now.
  function savePlayers(nextAppearances = appearances, nextAccount?: LocalGameAccountInput) {
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
      setPlayerSaveError(cause instanceof Error ? cause.message : "Could not save players.")
    }
  }

  function chooseMeSeat(value: string | undefined) {
    const seat = value === undefined ? undefined : Number(value)
    setMeSeat(seat)
    if (seat === undefined) setDeck(undefined)
    if (accountInput)
      savePlayers(appearances, {
        ...accountInput,
        meSeat: seat,
        ...(seat === undefined ? { deckVersionId: undefined, deckName: undefined } : {}),
      })
  }

  function chooseDeck(versionId: string | undefined) {
    const choice = deckChoices.find((candidate) => candidate.versionId === versionId)
    setDeck(choice)
    if (accountInput)
      savePlayers(appearances, {
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

  function choosePlayerCount(value: number) {
    if (value > playerCount)
      setAppearances((current) => {
        const next = [...current]
        for (let index = playerCount; index < value; index += 1)
          next[index] = resolveAppearance({
            preferred: current[index],
            taken: next.slice(0, index),
            seat: index + 1,
          })
        return next
      })
    setPlayerCount(value)
    setLayout((current) => playerGridLayoutForCount(value, current))
  }

  function openAppearancePicker(index: number, event?: GestureResponderEvent) {
    setAppearanceOrigin(
      event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined,
    )
    setAppearanceDraft(appearances[index])
    setAppearanceSeat(index)
  }

  function closeAppearancePicker() {
    setAppearanceSeat(undefined)
    setAppearanceDraft(undefined)
  }

  function saveAppearance() {
    if (appearanceSeat === undefined || !appearanceDraft) return
    const next = appearances.map((appearance, index) =>
      index === appearanceSeat ? appearanceDraft : appearance,
    )
    setAppearances(next)
    savePlayers(next)
    closeAppearancePicker()
  }

  return (
    <View style={[themed($root), $styles.flex1]}>
      <View style={themed($setupHeader)}>
        <Header
          title={onSavePlayers ? "Game setup" : "New game"}
          leftTx="common:back"
          backgroundColor={colors.surface}
          onLeftPress={onBack}
        />
        <SegmentedControl
          testID="mode"
          accessibilityLabel="Game connection"
          segments={[
            { id: "local", label: "On this device" },
            { id: "connected", label: "Connected" },
          ]}
          selectedId={mode}
          onSelect={(value) => onModeChange(value === "connected" ? "connected" : "local")}
        />

        {connectedMode && joinContent ? (
          <SegmentedControl
            testID="connected-action"
            accessibilityLabel="Host or join"
            segments={[
              { id: "host", label: "Host" },
              { id: "join", label: "Join" },
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
                  text="Resume hosted game"
                  onPress={() => onResumeConnected?.(hostedResumable)}
                />
              </View>
            ) : null}
            <View style={themed($section)}>
              <Text text="System" preset="subheading" accessibilityRole="header" />
              <SegmentedControl
                testID="play-system"
                accessibilityLabel="Game system"
                segments={[
                  { id: NO_PLAY_SYSTEM, label: "No system" },
                  ...PLAY_SYSTEM_LIST.map(({ id, shortLabel }) => ({ id, label: shortLabel })),
                ]}
                selectedId={system ?? NO_PLAY_SYSTEM}
                onSelect={chooseSystem}
              />
              {system ? (
                <SelectField
                  testID="play-format"
                  label="Format"
                  value={format}
                  options={playSystemFormats(system).map(({ id, label, blurb }) => ({
                    id,
                    label,
                    ...(blurb ? { detail: blurb } : {}),
                  }))}
                  onSelect={chooseFormat}
                />
              ) : null}
            </View>

            <View style={themed($valueGrid)}>
              <View style={themed($playerValue)}>
                <ValueField
                  testID="player-count"
                  label={connectedMode ? "Seats" : "Players"}
                  value={playerCount}
                  min={PLAYER_COUNTS[0]}
                  max={PLAYER_COUNTS[PLAYER_COUNTS.length - 1]}
                  onChange={choosePlayerCount}
                />
              </View>
              <View style={themed($counterValue)}>
                <ValueField
                  testID="starting-counter"
                  label={counter.heading}
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
                <Text text="Decks" preset="subheading" accessibilityRole="header" />
                <SegmentedControl
                  testID="deck-requirement"
                  accessibilityLabel="Deck requirement"
                  segments={[
                    { id: "optional", label: "Optional" },
                    { id: "required", label: "Required" },
                  ]}
                  selectedId={deckRequired ? "required" : "optional"}
                  onSelect={(value) => setDeckRequired(value === "required")}
                />
              </View>
            ) : null}

            {!connectedMode && !localGame ? (
              <View style={themed($section)}>
                <Text text="Match" preset="subheading" accessibilityRole="header" />
                <SegmentedControl
                  testID="match-mode"
                  accessibilityLabel="Match"
                  segments={[
                    { id: "off", label: "Single game" },
                    { id: "on", label: "Best of" },
                  ]}
                  selectedId={matchBestOf ? "on" : "off"}
                  onSelect={(value) => toggleMatch(value === "on")}
                />
                {matchBestOf ? (
                  <SegmentedControl
                    testID="match-best-of"
                    accessibilityLabel="Best of"
                    segments={MATCH_BEST_OF.map((bestOf) => ({
                      id: String(bestOf),
                      label: `Best of ${bestOf}`,
                    }))}
                    selectedId={String(matchBestOf)}
                    onSelect={(value) =>
                      setChosenBestOf(MATCH_BEST_OF.find((bestOf) => String(bestOf) === value))
                    }
                  />
                ) : null}
              </View>
            ) : null}

            <Button
              testID="setup-options"
              text={showOptions ? "Hide options" : "Layout and counter options"}
              accessibilityState={{ expanded: showOptions }}
              onPress={() => setShowOptions((value) => !value)}
            />
            {showOptions ? (
              <View style={themed($statusDetails)}>
                <View style={themed($section)}>
                  <SelectField
                    testID="life-step"
                    label="Change by"
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
                  <Text text="Layout" preset="subheading" accessibilityRole="header" />
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
                <Text tx="game:playerNames" preset="subheading" accessibilityRole="header" />
                <View style={themed($nameList)}>
                  {players.map((player, index) => (
                    <View key={index} style={themed($nameRow)}>
                      <TouchableOpacity
                        testID={`player-appearance-${index + 1}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Change appearance for ${player.name}`}
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
                        accessibilityLabel={`Name for player ${index + 1}`}
                        maxLength={MAX_PLAYER_NAME_LENGTH}
                        status={nameValidation.errors[index] ? "error" : undefined}
                        helper={
                          nameValidation.errors[index] ??
                          (nameFailsGate(names[index])
                            ? `Connected players will see "Player ${index + 1}" instead.`
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
                      label="This is me"
                      value={effectiveMeSeat === undefined ? undefined : String(effectiveMeSeat)}
                      placeholder="No seat"
                      clearLabel="No seat"
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
                        label="Your deck"
                        value={deck?.versionId}
                        placeholder={
                          account.decks === "unavailable"
                            ? "Decks unavailable"
                            : account.decks === undefined
                              ? "Loading decks…"
                              : deckChoices.length === 0
                                ? "No matching decks"
                                : "No deck"
                        }
                        clearLabel="No deck"
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
              <View style={canConnectLocal ? themed($footerActions) : undefined}>
                <Button
                  testID={connectedMode ? "host-connected-button" : "start-game-button"}
                  text={
                    gameBlocksStart
                      ? "End current game…"
                      : connectedMode
                        ? (connected?.access?.label ?? (busy ? "Working…" : "Host lobby"))
                        : undefined
                  }
                  tx={connectedMode || gameBlocksStart ? undefined : "game:startGame"}
                  preset="reversed"
                  style={[
                    canConnectLocal && themed($footerAction),
                    gameBlocksStart && themed($endCurrentButton),
                  ]}
                  textStyle={gameBlocksStart ? themed($endCurrentButtonText) : undefined}
                  disabled={
                    localGameBlocksStart
                      ? !onEndLocal || Boolean(localConnect?.busy)
                      : hostedGame
                        ? !connected?.ready || busy
                        : connectedBlocksLocal
                          ? !connected?.exitGame || busy
                          : !valid || busy
                  }
                  accessibilityHint={
                    gameBlocksStart
                      ? "Opens the end-game prompt before you can start another game"
                      : connectedMode
                        ? "Creates a lobby others can join"
                        : "Starts this local game on the current device"
                  }
                  onPress={
                    localGameBlocksStart
                      ? () => setEndingLocal(true)
                      : hostedGame
                        ? () => setGameToExit(hostedGame)
                        : singleBlockingConnected
                          ? () => setGameToExit(singleBlockingConnected)
                          : connectedBlocksLocal
                            ? () => setShowStatus(true)
                            : submit
                  }
                />
                {canConnectLocal ? (
                  <Button
                    testID="connect-local-button"
                    text={localConnect?.access?.label ?? "Connect"}
                    preset="reversed"
                    style={themed($footerAction)}
                    disabled={localConnect?.busy || localConnect?.ready === false}
                    accessibilityHint="Moves this game to the cloud so others can join it"
                    onPress={() =>
                      localConnect?.access
                        ? localConnect.access.request()
                        : setPickingHostSeat(true)
                    }
                  />
                ) : null}
              </View>
              <TouchableOpacity
                testID="setup-status"
                accessible={Boolean(statusText)}
                accessibilityRole={hasStatusDetails ? "button" : "text"}
                accessibilityLabel={statusText || "Game status"}
                accessibilityHint={
                  directResume
                    ? "Returns to your current game"
                    : hasStatusDetails
                      ? "Opens game and connection details"
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
                  text={statusText}
                  style={themed(
                    directResume || (connectedMode && hasStatusDetails) ? $resumeText : $statusText,
                  )}
                />
              </TouchableOpacity>
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
                  text="Try again"
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
            <Button text="Retry connection" onPress={connected.retry} />
          ) : null}

          {connectedGames.length ? (
            <View style={themed($section)}>
              <Text text="Your connected games" preset="subheading" accessibilityRole="header" />
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
                      text={game.isHost ? "End game…" : "Leave game…"}
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
                <Button text="Load more" onPress={connected.activeGamesNextPage.load} />
              ) : connected?.activeGamesNextPage?.status === "loading" ? (
                <Text size="xs" style={themed($footerStatus)} text="Loading more games…" />
              ) : null}
            </View>
          ) : null}
        </ScrollView>
        <Button text="Done" onPress={() => setShowStatus(false)} />
      </DialogCard>
      {gameToExit ? (
        <ConfirmDialog
          visible
          title={gameToExit.isHost ? "End this game?" : "Leave this game?"}
          message={
            gameToExit.isHost
              ? "This ends the game for everyone and records it as abandoned. This cannot be undone."
              : "You will leave this game. Other players and their history stay unchanged."
          }
          confirmText={gameToExit.isHost ? "End game" : "Leave game"}
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
          visible
          origin={appearanceOrigin}
          onClose={closeAppearancePicker}
          backdropTestID="local-appearance-backdrop"
          backdropAccessibilityLabel="Close color and mark picker"
          dialogTestID="local-appearance-dialog"
          accessibilityViewIsModal
        >
          <Text preset="subheading" text={`${players[appearanceSeat].name}'s color and mark`} />
          <AppearancePicker
            value={appearanceDraft}
            taken={appearances.slice(0, playerCount).filter((_, index) => index !== appearanceSeat)}
            onChange={setAppearanceDraft}
          />
          <View style={themed($dialogActions)}>
            <Button text="Cancel" style={themed($dialogButton)} onPress={closeAppearancePicker} />
            <Button
              testID="save-local-appearance-button"
              text="Save"
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
          <Text preset="subheading" text="Which seat is you?" />
          <Text
            size="xs"
            text="The other seats stay open for players to claim with an invite."
            style={themed($footerStatus)}
          />
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
          <Button text="Cancel" onPress={() => setPickingHostSeat(false)} />
        </DialogCard>
      ) : null}
      {endingLocal && localGame && onEndLocal ? (
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
