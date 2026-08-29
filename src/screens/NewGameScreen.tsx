import { useMemo, useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import {
  $dialogActions,
  $dialogButton,
  DialogCard,
  type DialogOrigin,
} from "@/components/DialogCard"
import { FilterChips } from "@/components/FilterChips"
import { Header } from "@/components/Header"
import { PlayerMark } from "@/components/PlayerMark"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { AppearancePicker } from "@/features/connected/AppearancePicker"
import {
  MAX_PLAYER_NAME_LENGTH,
  PLAYER_COLORS,
  validatePlayerNames,
  validateStartingLife,
} from "@/features/game/domain"
import type { LocalSettings } from "@/features/game/localPersistence"
import {
  PLAY_SYSTEM_LIST,
  playSystemFormat,
  playSystemFormats,
  playSystemRules,
  type PlaySystemId,
} from "@/features/game/playSystems"
import type { NewPlayerInput } from "@/features/game/types"
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
    system: PlaySystemId
    format: string
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
    setup: { system: PlaySystemId; format: string },
  ) => void
  connected?: ConnectedHostFeed
}

const PLAYER_COUNTS = [2, 3, 4, 5, 6]
const MAX_SEATS = 6

export function NewGameScreen({
  defaults,
  mode,
  onModeChange,
  onBack,
  onStartLocal,
  connected,
}: NewGameScreenProps) {
  const { themed } = useAppTheme()
  const $footerSafeArea = useSafeAreaInsetsStyle(["bottom"])
  const [playerCount, setPlayerCount] = useState(defaults.defaultPlayerCount)
  const [names, setNames] = useState<string[]>(() => Array.from({ length: MAX_SEATS }, () => ""))
  const [appearances, setAppearances] = useState<PlayerAppearance[]>(() =>
    Array.from({ length: MAX_SEATS }, (_, index) => ({
      color: PLAYER_COLORS[index],
      shape: shapeForSeat(index + 1),
    })),
  )
  const [appearanceSeat, setAppearanceSeat] = useState<number>()
  const [appearanceDraft, setAppearanceDraft] = useState<PlayerAppearance>()
  const [appearanceOrigin, setAppearanceOrigin] = useState<DialogOrigin>()
  const [system, setSystem] = useState<PlaySystemId>("mtg")
  const [format, setFormat] = useState(() => playSystemFormat("mtg"))
  const [lifeText, setLifeText] = useState(String(defaults.defaultStartingLife))
  const counter = playSystemRules(system).counter
  const [showCustomStartingLife, setShowCustomStartingLife] = useState(() =>
    playSystemRules("mtg").counter.presets.every((life) => life !== defaults.defaultStartingLife),
  )
  const connectedMode = mode === "connected"
  const startingLife = Number(lifeText)
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
    if (connectedMode)
      connected?.host({ playerCount, startingLife, ruleset: format, system, format })
    else onStartLocal(players, startingLife, { system, format })
  }

  function chooseSystem(value: string) {
    const next = PLAY_SYSTEM_LIST.find((candidate) => candidate.id === value)
    if (!next) return
    setSystem(next.id)
    setFormat(playSystemFormat(next.id))
    setLifeText(String(next.counter.defaultValue))
    setShowCustomStartingLife(false)
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
    <View style={$styles.flex1}>
      <Screen preset="scroll" contentInset="standard" contentContainerStyle={themed($form)}>
        <Header
          title={connectedMode ? "New connected game" : undefined}
          titleTx={connectedMode ? undefined : "game:newGame"}
          leftTx="common:back"
          onLeftPress={onBack}
        />
        <View style={themed($choiceRow)}>
          <ChoiceButton
            compact
            testID="mode-local"
            text="On this device"
            accessibilityHint="Everything stays on this device"
            selected={!connectedMode}
            style={themed($modeChoice)}
            onPress={() => onModeChange("local")}
          />
          <ChoiceButton
            compact
            testID="mode-connected"
            text="Connected"
            accessibilityHint="Play live with people on their own devices"
            selected={connectedMode}
            style={themed($modeChoice)}
            onPress={() => onModeChange("connected")}
          />
        </View>

        <View style={themed($section)}>
          <Text text="System" preset="subheading" accessibilityRole="header" />
          <FilterChips
            testID="play-system"
            accessibilityLabel="Game system"
            chips={PLAY_SYSTEM_LIST.map((candidate) => ({
              id: candidate.id,
              label: candidate.shortLabel,
            }))}
            selectedId={system}
            onSelect={chooseSystem}
          />
          <Text text="Format" preset="subheading" accessibilityRole="header" />
          <FilterChips
            testID="play-format"
            accessibilityLabel={`${playSystemRules(system).shortLabel} format`}
            chips={playSystemFormats(system).map((candidate) => ({
              id: candidate.id,
              label: candidate.label,
            }))}
            selectedId={format}
            onSelect={setFormat}
          />
        </View>

        <View style={themed($section)}>
          <Text
            text={connectedMode ? "Seats" : "Players"}
            preset="subheading"
            accessibilityRole="header"
          />
          <View style={themed($choiceRow)}>
            {PLAYER_COUNTS.map((count) => (
              <ChoiceButton
                compact
                key={count}
                text={String(count)}
                accessibilityLabel={connectedMode ? `${count} seats` : `${count} players`}
                selected={playerCount === count}
                style={themed($choice)}
                onPress={() => setPlayerCount(count)}
              />
            ))}
          </View>
        </View>

        <View style={themed($section)}>
          <Text text={`Starting ${counter.label}`} preset="subheading" accessibilityRole="header" />
          <View style={themed($choiceRow)}>
            {counter.presets.map((life) => (
              <ChoiceButton
                compact
                key={life}
                text={String(life)}
                accessibilityLabel={`Start at ${life} ${counter.label}`}
                selected={startingLife === life}
                style={themed($choice)}
                onPress={() => {
                  setShowCustomStartingLife(false)
                  setLifeText(String(life))
                }}
              />
            ))}
            <ChoiceButton
              compact
              text="Custom"
              accessibilityLabel="Use custom starting life"
              selected={showCustomStartingLife}
              style={themed($choice)}
              onPress={() => setShowCustomStartingLife(true)}
            />
          </View>
          {showCustomStartingLife ? (
            <TextField
              testID={connectedMode ? "connected-starting-life" : "custom-starting-life"}
              label={`Custom starting ${counter.label}`}
              value={lifeText}
              keyboardType="number-pad"
              status={validLife ? undefined : "error"}
              helper={`Whole number from 1 to ${counter.maxStartingValue}.`}
              onChangeText={setLifeText}
            />
          ) : null}
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
            text={connectedMode ? (busy ? "Creating…" : "Host lobby") : undefined}
            tx={connectedMode ? undefined : "game:startGame"}
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
    </View>
  )
}

function defaultName(index: number) {
  return `Player ${index + 1}`
}

const CONTENT_MAX_WIDTH = 720
const MIN_NAME_ROW_WIDTH = 280

const $form: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.lg })
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $choiceRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $choice: ThemedStyle<ViewStyle> = () => ({ flexGrow: 1, flexBasis: 56 })
const $modeChoice: ThemedStyle<ViewStyle> = () => ({ flexGrow: 1, flexBasis: 140 })
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
  backgroundColor: colors.background,
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
