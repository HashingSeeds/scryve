import type { ViewStyle } from "react-native"
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
        <Text size="xxs" numberOfLines={1} tone="dim" text={resumeDetail(game, now)} />
      </View>
      <Text size="lg" tone="dim" text="›" />
    </TouchableOpacity>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  minHeight: 64,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
  borderRadius: radius.xl,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $copy: ThemedStyle<ViewStyle> = () => ({ flex: 1, gap: 2 })
const $liveDot: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 10,
  height: 10,
  borderRadius: radius.full,
  backgroundColor: colors.tint,
})
const $waitingDot: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 10,
  height: 10,
  borderRadius: radius.full,
  borderWidth: 2,
  borderColor: colors.tint,
})
