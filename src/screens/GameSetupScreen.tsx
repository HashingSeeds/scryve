import { useMemo, useState } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
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
import type { ThemedStyle } from "@/theme/types"

export interface GameSetupScreenProps {
  defaults: LocalSettings
  onBack: () => void
  onStart: (players: NewPlayerInput[], startingLife: number) => void
}

export function GameSetupScreen({ defaults, onBack, onStart }: GameSetupScreenProps) {
  const { themed } = useAppTheme()
  const [playerCount, setPlayerCount] = useState(defaults.defaultPlayerCount)
  const [names, setNames] = useState(() => Array.from({ length: 6 }, (_, i) => `Player ${i + 1}`))
  const [lifeText, setLifeText] = useState(String(defaults.defaultStartingLife))
  const [showCustomStartingLife, setShowCustomStartingLife] = useState(() =>
    STARTING_LIFE_PRESETS.every((life) => life !== defaults.defaultStartingLife),
  )
  const startingLife = Number(lifeText)
  const validLife = validateStartingLife(startingLife)
  const nameValidation = validatePlayerNames(names.slice(0, playerCount))
  const valid = validLife && nameValidation.valid
  const players = useMemo(
    () => nameValidation.names.map((name, index) => ({ name, color: PLAYER_COLORS[index] })),
    [nameValidation.names],
  )

  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header titleTx="localGame:newGame" leftTx="common:back" onLeftPress={onBack} />
      <Text tx="localGame:players" preset="subheading" accessibilityRole="header" />
      <View style={themed($choiceRow)}>
        {[2, 3, 4, 5, 6].map((count) => (
          <Button
            key={count}
            text={String(count)}
            accessibilityLabel={`${count} players`}
            accessibilityState={{ selected: playerCount === count }}
            preset={playerCount === count ? "reversed" : "default"}
            style={themed($choice)}
            onPress={() => setPlayerCount(count)}
          />
        ))}
      </View>
      <Text tx="localGame:startingLife" preset="subheading" accessibilityRole="header" />
      <View style={themed($choiceRow)}>
        {STARTING_LIFE_PRESETS.map((life) => (
          <Button
            key={life}
            text={String(life)}
            accessibilityLabel={`Start at ${life} life`}
            accessibilityState={{ selected: startingLife === life }}
            preset={startingLife === life ? "reversed" : "default"}
            style={themed($choice)}
            onPress={() => setLifeText(String(life))}
          />
        ))}
        {!showCustomStartingLife ? (
          <Button
            text="…"
            accessibilityLabel="Use custom starting life"
            style={themed($choice)}
            onPress={() => setShowCustomStartingLife(true)}
          />
        ) : null}
      </View>
      {showCustomStartingLife ? (
        <TextField
          testID="custom-starting-life"
          labelTx="localGame:customStartingLife"
          value={lifeText}
          keyboardType="number-pad"
          status={validLife ? undefined : "error"}
          helper={validLife ? "Whole number from 1 to 999." : "Enter a whole number from 1 to 999."}
          onChangeText={setLifeText}
        />
      ) : null}
      <Text tx="localGame:playerNames" preset="subheading" accessibilityRole="header" />
      <View style={themed($nameList)}>
        {players.map((player, index) => (
          <View key={index} style={themed($nameRow)}>
            <View
              accessibilityLabel={`Player ${index + 1} color`}
              style={[themed($swatch), { backgroundColor: player.color }]}
            />
            <TextField
              testID={`player-name-${index + 1}`}
              label={`Player ${index + 1}`}
              value={names[index]}
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
      <Button
        testID="start-game-button"
        tx="localGame:startGame"
        preset="reversed"
        disabled={!valid}
        accessibilityHint="Starts this local game on the current device"
        onPress={() => valid && onStart(players, startingLife)}
      />
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  gap: spacing.md,
  paddingBottom: spacing.xl,
  paddingHorizontal: spacing.lg,
})
const $choiceRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $choice: ThemedStyle<ViewStyle> = () => ({ minWidth: 56, minHeight: 48, flexGrow: 1 })
const $nameList: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $nameRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $swatch: ThemedStyle<ViewStyle> = () => ({ width: 28, height: 56, borderRadius: 6 })
const $nameField: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
