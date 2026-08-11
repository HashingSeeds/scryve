import { useMemo, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { Header } from "@/components/Header"
import { PlayerMark } from "@/components/PlayerMark"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import {
  MAX_PLAYER_NAME_LENGTH,
  PLAYER_COLORS,
  STARTING_LIFE_PRESETS,
  validatePlayerNames,
  validateStartingLife,
} from "@/features/game/domain"
import type { LocalSettings } from "@/features/game/localPersistence"
import type { NewPlayerInput } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export type NewGameMode = "local" | "connected"

export interface ConnectedHostFeed {
  ready: boolean
  busy: boolean
  blockedReason?: string
  error?: string
  host: (setup: { playerCount: number; startingLife: number; ruleset: string }) => void
}

export interface NewGameScreenProps {
  defaults: LocalSettings
  mode: NewGameMode
  onModeChange: (mode: NewGameMode) => void
  onBack: () => void
  onStartLocal: (players: NewPlayerInput[], startingLife: number) => void
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
  const [lifeText, setLifeText] = useState(String(defaults.defaultStartingLife))
  const [ruleset, setRuleset] = useState("standard")
  const [showCustomStartingLife, setShowCustomStartingLife] = useState(() =>
    STARTING_LIFE_PRESETS.every((life) => life !== defaults.defaultStartingLife),
  )
  const connectedMode = mode === "connected"
  const startingLife = Number(lifeText)
  const validLife = validateStartingLife(startingLife)
  const seatNames = useMemo(
    () => names.slice(0, playerCount).map((name, index) => name.trim() || defaultName(index)),
    [names, playerCount],
  )
  const nameValidation = validatePlayerNames(seatNames)
  const normalizedRuleset = ruleset.trim()
  const validRuleset = normalizedRuleset.length > 0 && normalizedRuleset.length <= 32
  const players = useMemo(
    () => nameValidation.names.map((name, index) => ({ name, color: PLAYER_COLORS[index] })),
    [nameValidation.names],
  )
  const valid = connectedMode
    ? validLife && validRuleset && Boolean(connected?.ready) && !connected?.blockedReason
    : validLife && nameValidation.valid
  const busy = Boolean(connected?.busy)

  function submit() {
    if (!valid || busy) return
    if (connectedMode) connected?.host({ playerCount, startingLife, ruleset: normalizedRuleset })
    else onStartLocal(players, startingLife)
  }

  return (
    <View style={$styles.flex1}>
      <Screen preset="scroll" contentInset="standard" contentContainerStyle={themed($form)}>
        <Header
          title={connectedMode ? "New connected game" : undefined}
          titleTx={connectedMode ? undefined : "localGame:newGame"}
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
          <Text tx="localGame:startingLife" preset="subheading" accessibilityRole="header" />
          <View style={themed($choiceRow)}>
            {STARTING_LIFE_PRESETS.map((life) => (
              <ChoiceButton
                compact
                key={life}
                text={String(life)}
                accessibilityLabel={`Start at ${life} life`}
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
              labelTx="localGame:customStartingLife"
              value={lifeText}
              keyboardType="number-pad"
              status={validLife ? undefined : "error"}
              helper={
                validLife ? "Whole number from 1 to 999." : "Enter a whole number from 1 to 999."
              }
              onChangeText={setLifeText}
            />
          ) : null}
        </View>

        {connectedMode ? (
          <View style={themed($section)}>
            <Text text="Ruleset" preset="subheading" accessibilityRole="header" />
            <TextField
              testID="connected-ruleset"
              value={ruleset}
              maxLength={32}
              status={validRuleset ? undefined : "error"}
              helper={
                validRuleset
                  ? "Players name themselves as they join."
                  : "Enter a ruleset name up to 32 characters."
              }
              onChangeText={setRuleset}
            />
          </View>
        ) : (
          <View style={themed($section)}>
            <Text tx="localGame:playerNames" preset="subheading" accessibilityRole="header" />
            <View style={themed($nameList)}>
              {players.map((player, index) => (
                <View key={index} style={themed($nameRow)}>
                  <PlayerMark seatNumber={index + 1} color={player.color} size={32} />
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
        )}
      </Screen>
      <View style={[themed($footer), $footerSafeArea]}>
        <View style={themed($footerContent)}>
          {connectedMode && connected?.blockedReason ? (
            <Text
              accessibilityRole="alert"
              size="xs"
              text={connected.blockedReason}
              style={themed($footerNote)}
            />
          ) : null}
          {connectedMode && connected?.error ? (
            <Text
              accessibilityRole="alert"
              size="xs"
              text={connected.error}
              style={themed($footerNote)}
            />
          ) : null}
          <Button
            testID={connectedMode ? "host-connected-button" : "start-game-button"}
            text={connectedMode ? (busy ? "Creating…" : "Host lobby") : undefined}
            tx={connectedMode ? undefined : "localGame:startGame"}
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
const $nameField: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
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
