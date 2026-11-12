import type { ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { ColorChoices } from "@/components/ColorChoices"
import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import {
  LOCAL_MARK_SHAPES,
  type PlayerAppearance,
  type PlayerMarkShape,
  type ProMarkShape,
} from "../../../convex/lib/appearance"

export function AppearancePicker({
  value,
  taken = [],
  shapes = LOCAL_MARK_SHAPES,
  proShapes = [],
  proLocked = false,
  foil = false,
  onLockedPress,
  teamColor,
  onChange,
}: {
  value: PlayerAppearance
  taken?: PlayerAppearance[]
  shapes?: readonly PlayerMarkShape[]
  proShapes?: readonly ProMarkShape[]
  proLocked?: boolean
  foil?: boolean
  onLockedPress?: () => void
  teamColor?: { onPress: () => void }
  onChange: (next: PlayerAppearance) => void
}) {
  const { themed, theme } = useAppTheme()
  const takenColors = new Set(taken.map((entry) => entry.color.toUpperCase()))
  const takenShapes = new Set<PlayerMarkShape>(taken.map((entry) => entry.shape))

  function shapeOption(shape: PlayerMarkShape, index: number, pro: boolean) {
    const selected = shape === value.shape
    const unavailable = takenShapes.has(shape)
    const locked = pro && proLocked
    const shapeName = translate(`connected:appearance.shapes.${shape}`)
    return (
      <View key={shape} style={$option}>
        <TouchableOpacity
          testID={`appearance-shape-${shape}`}
          accessibilityRole="radio"
          accessibilityLabel={
            unavailable
              ? translate("connected:appearance.shapeTaken", { shape: shapeName })
              : locked
                ? translate("connected:appearance.shapePro", { shape: shapeName })
                : shapeName
          }
          accessibilityHint={
            locked && !unavailable ? translate("connected:appearance.opensPro") : undefined
          }
          accessibilityState={{ selected, disabled: unavailable }}
          disabled={unavailable}
          activeOpacity={0.75}
          style={[
            themed($swatch),
            selected && themed($selectedSwatch),
            unavailable && themed($exhausted),
            locked && !unavailable && $locked,
          ]}
          onPress={() => (locked ? onLockedPress?.() : onChange({ color: value.color, shape }))}
        >
          <PlayerMark
            seatNumber={index + 1}
            shape={shape}
            color={value.color}
            foil={pro && foil}
            foilBackdrop={theme.colors.background}
            size={32}
          />
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={themed($picker)}>
      <View style={themed($group)}>
        <Text size="xs" tone="dim" tx="connected:appearance.color" />
        <ColorChoices
          value={value.color}
          taken={takenColors}
          locked={!!teamColor}
          onChange={(color) => onChange({ ...value, color })}
        />
        {teamColor ? (
          <TextAction
            testID="appearance-team-color"
            tx="connected:appearance.teamColorInTeams"
            size="xs"
            style={$teamColor}
            onPress={teamColor.onPress}
          />
        ) : null}
      </View>
      <View style={themed($group)}>
        <Text size="xs" tone="dim" tx="connected:appearance.mark" />
        <View accessibilityRole="radiogroup" style={themed($row)}>
          {shapes.map((shape, index) => shapeOption(shape, index, false))}
        </View>
      </View>
      {proShapes.length ? (
        <View style={themed($group)}>
          <Text size="xs" tone="dim" tx="connected:appearance.pro" />
          <View accessibilityRole="radiogroup" style={themed($row)}>
            {proShapes.map((shape, index) => shapeOption(shape, index, true))}
          </View>
        </View>
      ) : null}
    </View>
  )
}

const $picker: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $group: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  rowGap: spacing.xxs,
})
const $option: ViewStyle = { width: "25%", alignItems: "center" }
const $swatch: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  padding: spacing.xxs,
  borderRadius: radius.xl,
  borderWidth: 2,
  borderColor: colors.transparent,
})
const $selectedSwatch: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $exhausted: ThemedStyle<ViewStyle> = ({ colors }) => ({
  opacity: 0.35,
  borderColor: colors.separator,
  borderStyle: "dashed",
})
const $locked: ViewStyle = { opacity: 0.45 }
const $teamColor: ViewStyle = { alignSelf: "flex-start", minHeight: 36, justifyContent: "center" }
