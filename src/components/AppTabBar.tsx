import { useRef, useState } from "react"
import type { ViewStyle } from "react-native"
import { Pressable, ScrollView, StyleSheet, View } from "react-native"
import { useKeyboardState } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useAppUpdate } from "@/features/updates/appUpdate"
import { useStoreUpdate } from "@/features/updates/storeUpdate"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { AppUtilityItems, type AppUtilityActions } from "./AppUtilityMenu"
import { Icon, type IconTypes } from "./Icon"
import { Sheet } from "./Sheet"
import { $sheetScroll, $sheetScrollContent } from "./sheetStyles"
import { Text } from "./Text"

export type AppTab = "decks" | "cards"

const TABS = [
  { id: "decks", icon: "decks" },
  { id: "cards", icon: "cards" },
] as const satisfies readonly { id: AppTab; icon: IconTypes }[]

export function AppTabBar({
  tab,
  onSelect,
  utility,
}: {
  tab: AppTab
  onSelect: (tab: AppTab) => void
  utility: AppUtilityActions
}) {
  const { themed, theme } = useAppTheme()
  const { bottom } = useSafeAreaInsets()
  const keyboardOpen = useKeyboardState((state) => state.isVisible)
  const [moreOpen, setMoreOpen] = useState(false)
  const pending = useRef<() => void>(undefined)
  const updateReady = useAppUpdate().status === "ready"
  const storeUpdate = useStoreUpdate()

  return (
    <>
      {keyboardOpen ? null : (
        <View
          testID="app-tab-bar"
          accessibilityRole="tablist"
          style={[themed($bar), { paddingBottom: Math.max(bottom, theme.spacing.xs) }]}
        >
          {TABS.map(({ id, icon }) => (
            <TabItem
              key={id}
              testID={`app-tab-${id}`}
              icon={icon}
              label={translate(`common:appNavigation.${id}`)}
              selected={tab === id}
              onPress={() => onSelect(id)}
            />
          ))}
          <TabItem
            testID="app-tab-more"
            icon="more"
            label={translate("common:appMenu.more")}
            accessibilityLabel={translate(
              storeUpdate
                ? "common:appMenu.moreStoreUpdate"
                : updateReady
                  ? "common:appMenu.moreUpdateReady"
                  : "common:appMenu.more",
            )}
            dot={Boolean(storeUpdate) || updateReady}
            onPress={() => setMoreOpen(true)}
          />
        </View>
      )}
      <Sheet
        visible={moreOpen}
        testID="app-tab-more-sheet"
        onClose={() => setMoreOpen(false)}
        onDismissed={() => {
          const action = pending.current
          pending.current = undefined
          action?.()
        }}
      >
        <ScrollView
          style={themed($sheetScroll)}
          contentContainerStyle={themed($sheetScrollContent)}
        >
          <AppUtilityItems
            {...utility}
            choose={(action) => {
              pending.current = action
              setMoreOpen(false)
            }}
          />
        </ScrollView>
      </Sheet>
    </>
  )
}

function TabItem({
  icon,
  label,
  accessibilityLabel = label,
  selected,
  dot,
  testID,
  onPress,
}: {
  icon: IconTypes
  label: string
  accessibilityLabel?: string
  selected?: boolean
  dot?: boolean
  testID: string
  onPress: () => void
}) {
  const { themed, theme } = useAppTheme()
  const color = selected ? theme.colors.tint : theme.colors.textDim
  return (
    <Pressable
      testID={testID}
      accessibilityRole={selected === undefined ? "button" : "tab"}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={themed($item)}
      onPress={onPress}
    >
      <View>
        <Icon icon={icon} size={24} color={color} />
        {dot ? <View style={themed($dot)} /> : null}
      </View>
      <Text
        size="xxs"
        weight="medium"
        numberOfLines={1}
        maxFontSizeMultiplier={TAB_MAX_FONT_SCALE}
        style={{ color }}
        text={label}
      />
    </Pressable>
  )
}

const TAB_MAX_FONT_SCALE = 1.3

const $bar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  paddingTop: spacing.xxs,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: colors.separator,
  backgroundColor: colors.surface,
})
const $item: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  minHeight: 48,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.xxs,
})
const $dot: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  position: "absolute",
  top: 0,
  end: -4,
  width: 8,
  height: 8,
  borderRadius: radius.full,
  backgroundColor: colors.tint,
})
