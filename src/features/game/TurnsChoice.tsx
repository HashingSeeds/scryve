import type { StyleProp, ViewStyle } from "react-native"
import { View } from "react-native"

import { ChoiceButton } from "@/components/ChoiceButton"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { localGameRepository, type LocalGameRepository } from "./localPersistence"
import { useChessMinutes, useTurnsEnabled } from "./TurnDialog"
import { CHESS_BANK_MINUTES } from "./turnTab"

type TurnsMode = "life" | "turns" | "chess"

const CHOICES = [
  { mode: "life", tx: "play:turnsChoice.lifeOnly", testID: "turns-choice-life" },
  { mode: "turns", tx: "play:turnsChoice.lifeAndTurns", testID: "turns-choice-turns" },
  { mode: "chess", tx: "play:turnsChoice.chessClock", testID: "turns-choice-chess" },
] as const satisfies readonly { mode: TurnsMode; tx: string; testID: string }[]

const DEFAULT_CHESS_MINUTES = 20

export function TurnsChoice({
  repository = localGameRepository,
  style,
}: {
  repository?: LocalGameRepository
  style?: StyleProp<ViewStyle>
}) {
  const { themed } = useAppTheme()
  const [enabled, setEnabled] = useTurnsEnabled(repository)
  const [minutes, setMinutes] = useChessMinutes(repository)
  const mode: TurnsMode = !enabled ? "life" : minutes ? "chess" : "turns"
  const choose = (next: TurnsMode) => {
    setEnabled(next !== "life")
    setMinutes(next === "chess" ? (minutes ?? DEFAULT_CHESS_MINUTES) : undefined)
  }
  return (
    <View style={[themed($stack), style]}>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={translate("play:turnsChoice.label")}
        style={themed($row)}
      >
        {CHOICES.map((choice) => (
          <ChoiceButton
            key={choice.testID}
            testID={choice.testID}
            tx={choice.tx}
            compact
            selected={mode === choice.mode}
            accessibilityRole="radio"
            accessibilityState={{ checked: mode === choice.mode }}
            style={$choice}
            onPress={() => choose(choice.mode)}
          />
        ))}
      </View>
      {mode === "chess" ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={translate("board:turn.chessBank")}
          style={themed($row)}
        >
          {CHESS_BANK_MINUTES.map((option) => (
            <ChoiceButton
              key={option}
              testID={`turns-chess-${option}`}
              text={translate("board:turn.chessMinutes", { minutes: option })}
              compact
              selected={minutes === option}
              accessibilityRole="radio"
              accessibilityState={{ checked: minutes === option }}
              style={$choice}
              onPress={() => setMinutes(option)}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flexDirection: "row", gap: spacing.xs })
const $choice: ViewStyle = { flex: 1 }
