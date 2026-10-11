import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import type { DiceTool } from "@/features/game/dice"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useCloseOnBack } from "@/utils/useCloseOnBack"

import { BoardPressable } from "./BoardPressable"
import { ResultLiveRegion } from "./ResultAnnouncer"
import { Text } from "./Text"

export interface DiceStripProps {
  armed: DiceTool | null
  tie: boolean
  vertical?: boolean
  webMessage: string
  onArm: (tool: DiceTool) => void
  onRollOff: () => void
  onFirst: () => void
  onClose: () => void
}

const TOOL_SIZE = 52

/** why: the strip stands in for the menu button at the hub, so it owns Back the same way the menu does. */
export function DiceStrip({
  armed,
  tie,
  vertical,
  webMessage,
  onArm,
  onRollOff,
  onFirst,
  onClose,
}: DiceStripProps) {
  const { themed } = useAppTheme()
  useCloseOnBack(true, onClose)

  return (
    <View
      testID="dice-strip"
      accessibilityLabel="Dice"
      style={[themed($strip), vertical && $vertical]}
    >
      <ResultLiveRegion testID="dice-announcer" message={webMessage} />
      <Tool
        testID="dice-d20"
        label="d20"
        accessibilityLabel={armed === "d20" ? "d20 armed, tap a seat" : "Roll a d20 for a seat"}
        selected={armed === "d20"}
        onPress={() => onArm("d20")}
      />
      <Tool
        testID="dice-coin"
        label="Coin"
        accessibilityLabel={armed === "coin" ? "Coin armed, tap a seat" : "Flip a coin for a seat"}
        selected={armed === "coin"}
        onPress={() => onArm("coin")}
      />
      <Tool
        testID="dice-rolloff"
        label={tie ? "Re-roll" : "Roll-off"}
        accessibilityLabel={tie ? "Re-roll the tied seats" : "Every seat rolls, highest goes first"}
        onPress={onRollOff}
      />
      <Tool
        testID="dice-first"
        label="First"
        accessibilityLabel="Pick who goes first"
        onPress={onFirst}
      />
      <Tool
        testID="dice-close"
        label="×"
        accessibilityLabel="Close dice"
        style={themed($close)}
        labelStyle={$closeGlyph}
        onPress={onClose}
      />
    </View>
  )
}

function Tool({
  testID,
  label,
  accessibilityLabel,
  selected,
  style,
  labelStyle,
  onPress,
}: {
  testID: string
  label: string
  accessibilityLabel: string
  selected?: boolean
  style?: ViewStyle
  labelStyle?: TextStyle
  onPress: () => void
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  return (
    <BoardPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [
        themed($tool),
        style,
        selected && themed($armed),
        pressed && $pressed,
      ]}
    >
      <Text
        text={label}
        weight="bold"
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={[
          themed($label),
          { color: selected ? colors.board.background : colors.board.text },
          labelStyle,
        ]}
      />
    </BoardPressable>
  )
}

const $strip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
  padding: spacing.xxs,
  borderRadius: TOOL_SIZE / 2 + spacing.xxs,
  backgroundColor: colors.board.background,
})
const $vertical: ViewStyle = { flexDirection: "column" }
const $tool: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: TOOL_SIZE,
  height: TOOL_SIZE,
  borderRadius: TOOL_SIZE / 2,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.board.surface,
})
const $armed: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.board.text })
const $close: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.transparent })
const $pressed: ViewStyle = { opacity: 0.72 }
const $label: ThemedStyle<TextStyle> = () => ({ fontSize: 11, lineHeight: 14 })
const $closeGlyph: TextStyle = { fontSize: 22, lineHeight: 26, opacity: 0.8 }
