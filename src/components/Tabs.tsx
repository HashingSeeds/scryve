import type { ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Text } from "./Text"
import { useRevealSelected } from "./useRevealSelected"

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
  accessibilityLabel,
  testID,
  trailing,
  scrolls = false,
}: {
  tabs: readonly Tab<Id>[]
  selectedId: Id
  onSelect: (id: Id) => void
  disabled?: boolean
  accessibilityLabel?: string
  testID?: string
  trailing?: ReactNode
  scrolls?: boolean
}) {
  const { themed } = useAppTheme()
  const { scrollProps, itemLayout } = useRevealSelected(scrolls ? selectedId : undefined)
  const bar = (
    <View
      style={[themed($bar), scrolls && $scrollingBar]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
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
            onLayout={scrolls ? itemLayout(tab.id) : undefined}
            onPress={() => onSelect(tab.id)}
          >
            <Text size="sm" weight="medium" tone={selected ? undefined : "dim"}>
              {tab.label}
              {tab.count === undefined ? null : (
                <>
                  {" "}
                  <Text size="xs" tone="dim" style={$count} text={tab.count} />
                </>
              )}
            </Text>
          </TouchableOpacity>
        )
      })}
      {trailing ? <View style={$trailing}>{trailing}</View> : null}
    </View>
  )
  return scrolls ? (
    <ScrollView
      {...scrollProps}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={$scrollContent}
    >
      {bar}
    </ScrollView>
  ) : (
    bar
  )
}

const $bar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  // why: at large text sizes the labels outgrow a phone's width, and a tab off-screen can't be reached.
  flexWrap: "wrap",
  gap: spacing.lg,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $scrollingBar: ViewStyle = { flexWrap: "nowrap", flexGrow: 1 }
const $scrollContent: ViewStyle = { flexGrow: 1 }
const $tab: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  justifyContent: "center",
  paddingHorizontal: spacing.xxs,
  borderBottomWidth: 2,
  borderBottomColor: "transparent",
})
const $selectedTab: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderBottomColor: colors.tint })
const $trailing: ViewStyle = { marginStart: "auto", justifyContent: "center" }
const $count: TextStyle = { fontVariant: ["tabular-nums"] }
