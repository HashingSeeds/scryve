import type { TextStyle, ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { resumeDetail, resumeTitle, type ResumableGame } from "./connectedCopy"

export function ConnectedGameRow({
  game,
  now,
  onPress,
}: {
  game: ResumableGame
  now: number
  onPress: () => void
}) {
  const { themed } = useAppTheme()
  const waiting = game.status === "lobby"
  return (
    <TouchableOpacity
      testID={`resume-connected-${game.publicId}`}
      accessibilityRole="button"
      accessibilityLabel={`${resumeTitle(game)}, ${resumeDetail(game, now)}`}
      activeOpacity={0.75}
      style={themed($row)}
      onPress={onPress}
    >
      <View style={themed(waiting ? $waitingDot : $liveDot)} />
      <View style={themed($copy)}>
        <Text weight="medium" numberOfLines={1} text={resumeTitle(game)} />
        <Text size="xxs" numberOfLines={1} style={themed($detail)} text={resumeDetail(game, now)} />
      </View>
      <Text size="lg" style={themed($detail)} text="›" />
    </TouchableOpacity>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 64,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
  borderRadius: spacing.sm,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $copy: ThemedStyle<ViewStyle> = () => ({ flex: 1, gap: 2 })
const $detail: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $liveDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 10,
  height: 10,
  borderRadius: 5,
  backgroundColor: colors.tint,
})
const $waitingDot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 10,
  height: 10,
  borderRadius: 5,
  borderWidth: 2,
  borderColor: colors.tint,
})
