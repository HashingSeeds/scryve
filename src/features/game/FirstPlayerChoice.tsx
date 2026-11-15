import { useCallback, useSyncExternalStore } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { ChoiceButton } from "@/components/ChoiceButton"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { FIRST_PLAYER_MODES, systemDice, type FirstPlayerMode } from "./dice"
import { localGameRepository, type LocalGameRepository } from "./localPersistence"

export function useFirstPlayerMode(repository: LocalGameRepository, system: string | undefined) {
  const subscribe = useCallback(
    (listener: () => void) => repository.onSettingsChanged(listener),
    [repository],
  )
  const mode = useSyncExternalStore(subscribe, () => repository.firstPlayerMode(system))
  const setMode = useCallback(
    (next: FirstPlayerMode) => repository.saveFirstPlayerMode(system, next),
    [repository, system],
  )
  return [mode, setMode] as const
}

export const firstPlayerFlips = (system: unknown, playerCount: number) =>
  systemDice(system).twoPlayerCoinFlip && playerCount === 2

export function FirstPlayerChoice({
  system,
  playerCount,
  repository = localGameRepository,
}: {
  system: string | undefined
  playerCount: number
  repository?: LocalGameRepository
}) {
  const { themed } = useAppTheme()
  const [mode, setMode] = useFirstPlayerMode(repository, system)
  const label = translate("play:firstPlayerChoice.label")
  const flips = firstPlayerFlips(system, playerCount)
  return (
    <View style={themed($section)}>
      <Text text={label} preset="subheading" accessibilityRole="header" />
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={themed($row)}>
        {FIRST_PLAYER_MODES.map((option) => (
          <ChoiceButton
            key={option}
            testID={`first-player-choice-${option}`}
            tx={
              option === "roll" && flips
                ? "play:firstPlayerChoice.flip"
                : `play:firstPlayerChoice.${option}`
            }
            compact
            selected={mode === option}
            accessibilityRole="radio"
            accessibilityState={{ checked: mode === option }}
            style={$choice}
            onPress={() => setMode(option)}
          />
        ))}
      </View>
    </View>
  )
}

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flexDirection: "row", gap: spacing.xs })
const $choice: ViewStyle = { flex: 1 }
