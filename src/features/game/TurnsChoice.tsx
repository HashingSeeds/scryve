import type { StyleProp, ViewStyle } from "react-native"
import { View } from "react-native"

import { ChoiceButton } from "@/components/ChoiceButton"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { localGameRepository, type LocalGameRepository } from "./localPersistence"
import { useTurnsEnabled } from "./TurnDialog"

const CHOICES = [
  { on: false, tx: "play:turnsChoice.lifeOnly", testID: "turns-choice-life" },
  { on: true, tx: "play:turnsChoice.lifeAndTurns", testID: "turns-choice-turns" },
] as const

export function TurnsChoice({
  repository = localGameRepository,
  style,
}: {
  repository?: LocalGameRepository
  style?: StyleProp<ViewStyle>
}) {
  const { themed } = useAppTheme()
  const [enabled, setEnabled] = useTurnsEnabled(repository)
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={translate("play:turnsChoice.label")}
      style={[themed($row), style]}
    >
      {CHOICES.map(({ on, tx, testID }) => (
        <ChoiceButton
          key={testID}
          testID={testID}
          tx={tx}
          compact
          selected={enabled === on}
          accessibilityRole="radio"
          accessibilityState={{ checked: enabled === on }}
          style={$choice}
          onPress={() => setEnabled(on)}
        />
      ))}
    </View>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flexDirection: "row", gap: spacing.xs })
const $choice: ViewStyle = { flex: 1 }
