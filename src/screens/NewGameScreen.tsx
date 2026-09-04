import { useMemo, useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
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
import { AppearancePicker } from "@/features/connected/AppearancePicker"
import {
  MAX_PLAYER_NAME_LENGTH,
  PLAYER_COLORS,
  validatePlayerNames,
  validateStartingLife,
} from "@/features/game/domain"
import type { LocalSettings } from "@/features/game/localPersistence"
import {
  playerGridLayoutForCount,
  type PlayerGridLayoutVariant,
} from "@/features/game/playerLayouts"
import {
  isPlaySystemId,
  NO_PLAY_SYSTEM,
  PLAY_SYSTEM_LIST,
  playSystemFormat,
  playSystemFormats,
  playSystemRules,
  type PlaySystemId,
} from "@/features/game/playSystems"
import type { LocalGame, NewPlayerInput } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

import { shapeForSeat, type PlayerAppearance } from "../../convex/lib/appearance"

export type NewGameMode = "local" | "connected"

export interface ConnectedHostFeed {
  ready: boolean
  busy: boolean
  status?: string
  blockedReason?: string
  error?: string
  retry?: () => void
  host: (setup: {
    playerCount: number
    startingLife: number
    ruleset: string
    system?: PlaySystemId
    format?: string
    layout: PlayerGridLayoutVariant
    lifeStep: number
  }) => void
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
    },
  ) => void
  connected?: ConnectedHostFeed
  localSubmitText?: string
  initialGame?: LocalGame
  confirmLocalSubmit?: boolean
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
  localSubmitText,
  initialGame,
  confirmLocalSubmit = false,
}: NewGameScreenProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const $footerSafeArea = useSafeAreaInsetsStyle(["bottom"])
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
      shape: initialGame?.players[index]?.shape ?? shapeForSeat(index + 1),
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
  const [lifeStep, setLifeStep] = useState(
    initialGame?.lifeStep ?? playSystemRules(initialSystem).counter.tapStep,
  )
  const counter = playSystemRules(system).counter
  const [confirmingLocalSubmit, setConfirmingLocalSubmit] = useState(false)
  const connectedMode = mode === "connected"
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
        shape: appearances[index]?.shape ?? shapeForSeat(index + 1),
      })),
    [appearances, nameValidation.names],
  )
  const valid = connectedMode
    ? validLife && Boolean(connected?.ready) && !connected?.blockedReason
    : validLife && nameValidation.valid
  const busy = Boolean(connected?.busy)

  function submit() {
    if (!valid || busy) return
    const setup = {
      layout,
      lifeStep,
      ...(system && format ? { system, format } : {}),
    }
    if (connectedMode)
      connected?.host({ playerCount, startingLife, ruleset: format ?? NO_PLAY_SYSTEM, ...setup })
    else if (confirmLocalSubmit) setConfirmingLocalSubmit(true)
    else onStartLocal(players, startingLife, setup)
  }

  function chooseSystem(value: string) {
    const next = isPlaySystemId(value) ? value : undefined
    const nextCounter = playSystemRules(next).counter
    setSystem(next)
    setFormat(next ? playSystemFormat(next) : undefined)
    setStartingLife(nextCounter.defaultValue)
    setLifeStep(nextCounter.tapStep)
  }

  function choosePlayerCount(value: number) {
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
    setAppearances((current) =>
      current.map((appearance, index) => (index === appearanceSeat ? appearanceDraft : appearance)),
    )
    closeAppearancePicker()
  }

  return (
    <View style={[themed($root), $styles.flex1]}>
      <Screen preset="scroll" contentInset="standard" contentContainerStyle={themed($form)}>
        <Header
          title="New game"
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
              onSelect={setFormat}
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

        <View style={themed($section)}>
          <SelectField
            testID="life-step"
            label="Change by"
            value={String(lifeStep)}
            options={LIFE_STEP_OPTIONS.map((step) => ({ id: String(step), label: String(step) }))}
            onSelect={(value) => {
              const next = LIFE_STEP_OPTIONS.find((step) => String(step) === value)
              if (next) setLifeStep(next)
            }}
          />
        </View>

        <View style={themed($section)}>
          <Text text="Layout" preset="subheading" accessibilityRole="header" />
          <PlayerLayoutPicker playerCount={playerCount} value={layout} onChange={setLayout} />
        </View>

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
                    helper={nameValidation.errors[index]}
                    containerStyle={themed($nameField)}
                    onChangeText={(value) =>
                      setNames((current) => current.map((name, i) => (i === index ? value : name)))
                    }
                  />
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Screen>
      <View style={[themed($footer), $footerSafeArea]}>
        <View style={themed($footerContent)}>
          {connectedMode && connected?.status ? (
            <Text
              testID="connected-host-preparation"
              accessibilityRole="progressbar"
              accessibilityLiveRegion="polite"
              size="xs"
              text={connected.status}
              style={themed($footerStatus)}
            />
          ) : null}
          {connectedMode && connected?.blockedReason ? (
            <Text
              accessibilityRole="alert"
              size="xs"
              text={connected.blockedReason}
              style={themed($footerNote)}
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
          <Button
            testID={connectedMode ? "host-connected-button" : "start-game-button"}
            text={connectedMode ? (busy ? "Creating…" : "Host lobby") : localSubmitText}
            tx={connectedMode || localSubmitText ? undefined : "game:startGame"}
            preset="reversed"
            disabled={!valid || busy}
            accessibilityHint={
              connectedMode
                ? "Creates a lobby others can join"
                : "Starts this local game on the current device"
            }
            onPress={submit}
          />
        </View>
      </View>
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
      {confirmingLocalSubmit ? (
        <DialogCard
          visible
          onClose={() => setConfirmingLocalSubmit(false)}
          dialogTestID="confirm-reset-game-dialog"
          dialogAccessibilityRole="alert"
        >
          <Text preset="subheading" text="Reset this game?" />
          <Text text="The current board will be replaced with these starting values." />
          <View style={themed($dialogActions)}>
            <Button
              text="Cancel"
              style={themed($dialogButton)}
              onPress={() => setConfirmingLocalSubmit(false)}
            />
            <Button
              testID="confirm-reset-game-button"
              text="Reset game"
              preset="reversed"
              style={themed($dialogButton)}
              onPress={() => {
                setConfirmingLocalSubmit(false)
                onStartLocal(players, startingLife, {
                  layout,
                  lifeStep,
                  ...(system && format ? { system, format } : {}),
                })
              }}
            />
          </View>
        </DialogCard>
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
  gap: spacing.lg,
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
const $retryConnected: ThemedStyle<ViewStyle> = () => ({ minHeight: 40 })
const $nameField: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
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
  paddingBottom: spacing.sm,
})
const $footerNote: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
const $footerStatus: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
