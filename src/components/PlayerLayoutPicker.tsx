import type { ViewStyle } from "react-native"
import { Pressable, useWindowDimensions, View } from "react-native"

import {
  getPlayerGridLayoutOptions,
  type PlayerGridLayoutVariant,
} from "@/features/game/playerLayouts"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { getPlayerGridLayout, getPlayerGridRowFlex, getPlayerGridRows } from "./PlayerGrid"
import { Text } from "./Text"

export function PlayerLayoutPicker({
  playerCount,
  value,
  testID = "player-layout",
  onChange,
}: {
  playerCount: number
  value: PlayerGridLayoutVariant
  testID?: string
  onChange: (value: PlayerGridLayoutVariant) => void
}) {
  const { themed } = useAppTheme()
  const { width, height } = useWindowDimensions()
  const options = getPlayerGridLayoutOptions(playerCount)
  const previewWidth = Math.min(88, Math.max(64, Math.floor((width - 72) / 3)))
  const previewStyle = { width: previewWidth, aspectRatio: width / height }

  return (
    <View testID={testID} style={themed($options)}>
      {options.map((option) => {
        const selected = option.variant === value
        return (
          <Pressable
            key={option.variant}
            testID={`${testID}-${option.variant}`}
            accessibilityRole="radio"
            accessibilityLabel={`${option.label} layout`}
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              themed($option),
              { width: previewWidth + 16 },
              selected && themed($selectedOption),
              pressed && themed($pressedOption),
            ]}
            onPress={() => onChange(option.variant)}
          >
            <LayoutPreview
              testID={`${testID}-${option.variant}-preview`}
              playerCount={playerCount}
              variant={option.variant}
              width={width}
              height={height}
              previewStyle={previewStyle}
            />
            <Text text={option.label} size="xs" weight="medium" />
          </Pressable>
        )
      })}
    </View>
  )
}

function LayoutPreview({
  testID,
  playerCount,
  variant,
  width,
  height,
  previewStyle,
}: {
  testID: string
  playerCount: number
  variant: PlayerGridLayoutVariant
  width: number
  height: number
  previewStyle: ViewStyle
}) {
  const { themed } = useAppTheme()
  const layout = getPlayerGridLayout({
    playerCount,
    width,
    height,
    layoutVariant: variant,
  })
  const rows = getPlayerGridRows(playerCount, layout)
  return (
    <View
      testID={testID}
      importantForAccessibility="no-hide-descendants"
      style={[themed($preview), previewStyle]}
    >
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[themed($previewRow), { flex: getPlayerGridRowFlex(row, layout) }]}
        >
          {row.map((seat, columnIndex) =>
            seat === null ? (
              <View key={`empty-${columnIndex}`} style={$previewCell} />
            ) : (
              <View key={seat} style={[themed($previewSeat), $previewCell]} />
            ),
          )}
        </View>
      ))}
    </View>
  )
}

const $options: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $option: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  gap: spacing.xxs,
  padding: spacing.xs,
  borderWidth: 2,
  borderColor: colors.border,
  borderRadius: 12,
})
const $selectedOption: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $pressedOption: ThemedStyle<ViewStyle> = () => ({ opacity: 0.78 })
const $preview: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xxs,
  padding: spacing.xxs,
  backgroundColor: colors.board.background,
  borderRadius: 8,
})
const $previewRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  gap: spacing.xxs,
})
const $previewCell: ViewStyle = { flex: 1 }
const $previewSeat: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.gameMenu.actions.players,
  borderRadius: 4,
})
