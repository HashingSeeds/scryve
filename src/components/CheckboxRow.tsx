import type { ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import { Icon } from "./Icon"
import { Text } from "./Text"

/** why: only the box takes the accent; full peach rows for every pick competed with the screen's one primary button. */
export function CheckboxRow({
  label,
  detail,
  checked,
  onToggle,
  disabled,
  testID,
}: {
  label: string
  detail?: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
  testID?: string
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ pressed }) => [themed($row), pressed && $pressed, disabled && $disabled]}
      onPress={onToggle}
    >
      <View style={[themed($box), checked && themed($checkedBox)]}>
        {checked ? <Icon icon="check" size={16} color={accessibleForeground(colors.tint)} /> : null}
      </View>
      <View style={$text}>
        <Text weight="medium" text={label} numberOfLines={1} />
        {detail ? <Text size="meta" tone="dim" text={detail} numberOfLines={1} /> : null}
      </View>
    </Pressable>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
})
const $box: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 22,
  height: 22,
  borderRadius: radius.sm,
  borderWidth: 1.5,
  borderColor: colors.border,
  alignItems: "center",
  justifyContent: "center",
})
const $checkedBox: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.tint,
  backgroundColor: colors.tint,
})
const $text: ViewStyle = { flex: 1 }
const $pressed: ViewStyle = { opacity: 0.7 }
const $disabled: ViewStyle = { opacity: 0.5 }
