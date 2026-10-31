import type { TextStyle, ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Text } from "./Text"

export interface Tab<Id extends string> {
  id: Id
  label: string
  count?: number
}

export function Tabs<Id extends string>({
  tabs,
  selectedId,
  onSelect,
  disabled,
  testID,
}: {
  tabs: readonly Tab<Id>[]
  selectedId: Id
  onSelect: (id: Id) => void
  disabled?: boolean
  testID?: string
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($bar)} accessibilityRole="tablist" testID={testID}>
      {tabs.map((tab) => {
        const selected = tab.id === selectedId
        return (
          <TouchableOpacity
            key={tab.id}
            testID={testID ? `${testID}-${tab.id}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: Boolean(disabled) }}
            disabled={disabled}
            style={[themed($tab), selected && themed($selectedTab)]}
            onPress={() => onSelect(tab.id)}
          >
            <Text size="sm" weight="medium" tone={selected ? undefined : "dim"}>
              {tab.label}
              {tab.count === undefined ? null : (
                <Text size="xs" tone="dim" style={$count} text={` ${tab.count}`} />
              )}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const $bar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.lg,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $tab: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  justifyContent: "center",
  paddingHorizontal: spacing.xxs,
  borderBottomWidth: 2,
  borderBottomColor: "transparent",
})
const $selectedTab: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderBottomColor: colors.tint })
const $count: TextStyle = { fontVariant: ["tabular-nums"] }
