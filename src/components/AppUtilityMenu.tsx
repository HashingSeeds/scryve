import { type ComponentProps, useEffect, useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import { readPublicCloudConfig } from "@/features/auth/config"
import { openEvents } from "@/features/events/openEvents"
import { nearbyBetaAvailable } from "@/features/lan/lanAvailability"
import { setNearbyOnly, useNearbyOnly } from "@/features/lan/nearbyOnly"
import { useAppUpdate } from "@/features/updates/appUpdate"
import { updateFromStore, useStoreUpdate } from "@/features/updates/storeUpdate"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useCloseOnBack } from "@/utils/useCloseOnBack"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { DialogCard, type DialogOrigin } from "./DialogCard"
import { Text } from "./Text"

export type AccountEntry = "account" | "signIn"

export function AppUtilityMenu({
  visible = true,
  compact = false,
  placement = "topRight",
  onDecks,
  onRules,
  onHistory,
  onSettings,
  onSupport,
  onAccount,
  onOpenHeightChange,
  onChoose,
  accountEntry = "account",
}: {
  visible?: boolean
  compact?: boolean
  placement?: "topRight" | "bottomLeft" | "board"
  onDecks?: () => void
  onRules?: () => void
  onHistory?: () => void
  onSettings: () => void
  onSupport: () => void
  onAccount: () => void
  onOpenHeightChange?: (height: number) => void
  // why: runs before any item, so a screen can settle its own state before the app moves on.
  onChoose?: () => void
  accountEntry?: AccountEntry
}) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState<DialogOrigin>()
  const updateReady = useAppUpdate().status === "ready"
  const storeUpdate = useStoreUpdate()
  const nearbyOnly = useNearbyOnly()
  const testsNearby = nearbyBetaAvailable()
  const showsEvents = nearbyOnly || readPublicCloudConfig().configured
  const itemCount =
    3 +
    Number(Boolean(onDecks)) +
    Number(Boolean(onRules)) +
    Number(Boolean(onHistory)) +
    Number(testsNearby) +
    Number(Boolean(storeUpdate)) +
    Number(showsEvents)
  const openWidth = compact ? (testsNearby ? 176 : 148) : 188
  const progress = useSharedValue(0)

  useEffect(() => {
    if (!visible && open) {
      setOpen(false)
      onOpenHeightChange?.(0)
    }
  }, [onOpenHeightChange, open, visible])

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: motionDuration(reducedMotion, 180),
    })
  }, [open, progress, reducedMotion])

  const containerStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [compact ? 44 : 92, openWidth]),
    height: interpolate(progress.value, [0, 1], [44, ITEM_HEIGHT * itemCount]),
    borderRadius: compact ? interpolate(progress.value, [0, 1], [22, 16]) : 0,
  }))
  const triggerStyle = useAnimatedStyle(() => ({ opacity: progress.value < 0.05 ? 1 : 0 }))
  const itemsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.5, 1], [0, 1], "clamp"),
  }))

  const close = () => {
    setOpen(false)
    onOpenHeightChange?.(0)
  }
  useCloseOnBack(open, close)

  if (!visible) return null
  const choose = (action: () => void) => {
    close()
    onChoose?.()
    action()
  }
  const openMenu = (event?: GestureResponderEvent) => {
    setOrigin(
      event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : undefined,
    )
    setOpen(true)
    onOpenHeightChange?.(ITEM_HEIGHT * itemCount)
  }
  const updateDot = updateReady || storeUpdate
  const items = (
    <>
      {storeUpdate ? (
        <Pressable
          testID="utility-store-update-button"
          accessibilityRole="link"
          accessibilityLabel={translate(storeUpdate.labelTx)}
          style={themed($item)}
          onPress={() => choose(updateFromStore)}
        >
          <Text
            tx="common:appMenu.updateApp"
            weight="bold"
            numberOfLines={1}
            maxFontSizeMultiplier={MENU_MAX_FONT_SCALE}
            style={themed($storeUpdateText)}
          />
        </Pressable>
      ) : null}
      {onDecks ? (
        <Item
          testID="utility-decks-button"
          tx="common:appNavigation.decks"
          onPress={() => choose(onDecks)}
        />
      ) : null}
      {onRules ? (
        <Item
          testID="utility-rules-button"
          tx="board:menu.rules"
          onPress={() => {
            close()
            onRules()
          }}
        />
      ) : null}
      {onHistory ? (
        <Item
          testID="utility-history-button"
          tx="common:appMenu.history"
          onPress={() => choose(onHistory)}
        />
      ) : null}
      {showsEvents ? (
        <Item
          testID="utility-events-button"
          tx="events:title"
          onPress={() => choose(() => openEvents(nearbyOnly))}
        />
      ) : null}
      {testsNearby ? (
        <Pressable
          testID="utility-nearby-only-button"
          accessibilityRole="switch"
          accessibilityState={{ checked: nearbyOnly }}
          style={themed($item)}
          onPress={() => choose(() => setNearbyOnly(!nearbyOnly))}
        >
          <Text
            tx={nearbyOnly ? "common:appMenu.nearbyOnlyOn" : "common:appMenu.nearbyOnlyOff"}
            weight="medium"
            numberOfLines={1}
            maxFontSizeMultiplier={MENU_MAX_FONT_SCALE}
          />
        </Pressable>
      ) : null}
      <Item
        testID="utility-account-button"
        tx={`common:appMenu.${accountEntry}`}
        onPress={() => choose(onAccount)}
      />
      <Item
        testID="utility-support-button"
        tx="common:appMenu.support"
        onPress={() => choose(onSupport)}
      />
      <Pressable
        testID="utility-settings-button"
        accessibilityRole="button"
        accessibilityLabel={translate(
          updateReady ? "common:appMenu.settingsUpdateReady" : "common:appMenu.settings",
        )}
        style={themed([$item, $settingsItem])}
        onPress={() => choose(onSettings)}
      >
        <Text
          tx="common:appMenu.settings"
          weight="medium"
          numberOfLines={1}
          maxFontSizeMultiplier={MENU_MAX_FONT_SCALE}
        />
        {updateReady ? <View style={themed($inlineUpdateDot)} /> : null}
      </Pressable>
    </>
  )
  const trigger = (
    <Pressable
      testID="utility-menu-button"
      accessibilityRole="button"
      accessibilityLabel={translate(
        storeUpdate
          ? "common:appMenu.moreStoreUpdate"
          : updateReady
            ? "common:appMenu.moreUpdateReady"
            : "common:appMenu.more",
      )}
      accessibilityState={{ expanded: open }}
      style={themed($trigger)}
      onPress={openMenu}
    >
      {compact || placement === "board" ? (
        <View testID="utility-menu-dots" accessible={false} style={$dotsRow}>
          <View style={themed($dot)} />
          <View style={themed($dot)} />
          <View style={themed($dot)} />
        </View>
      ) : (
        <Text
          tx="common:appMenu.more"
          weight="bold"
          size="xs"
          numberOfLines={1}
          maxFontSizeMultiplier={MENU_MAX_FONT_SCALE}
        />
      )}
      {updateDot ? <View testID="utility-update-dot" style={themed($updateDot)} /> : null}
    </Pressable>
  )

  if (placement === "board")
    return (
      <View testID="utility-menu-slot" style={themed($boardTrigger)}>
        {trigger}
        <DialogCard
          visible={open}
          onClose={close}
          origin={origin}
          backdropTestID="utility-menu-backdrop"
          backdropAccessibilityLabel={translate("common:appMenu.closeMenu")}
          dialogTestID="utility-menu"
          style={[themed($boardSheet), { width: openWidth, height: ITEM_HEIGHT * itemCount }]}
        >
          {items}
        </DialogCard>
      </View>
    )

  const slotStyle = open ? { width: openWidth, height: ITEM_HEIGHT * itemCount } : undefined

  return (
    <Animated.View
      testID="utility-menu-slot"
      pointerEvents="box-none"
      style={[compact ? $compactSlot : $slot, slotStyle]}
    >
      {open ? (
        <Pressable
          testID="utility-menu-backdrop"
          accessibilityLabel={translate("common:appMenu.closeMenu")}
          style={$backdrop}
          onPress={close}
        />
      ) : null}
      <Animated.View
        testID="utility-menu"
        style={[
          themed($menu),
          placement === "bottomLeft" ? $bottomLeft : $topRight,
          containerStyle,
        ]}
      >
        <Animated.View
          pointerEvents={open ? "none" : "auto"}
          accessibilityElementsHidden={open}
          importantForAccessibility={open ? "no-hide-descendants" : "auto"}
          style={[$fill, triggerStyle]}
        >
          {trigger}
        </Animated.View>
        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? "auto" : "no-hide-descendants"}
          style={[$fill, themed($items), itemsStyle]}
        >
          {items}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  )
}

function Item({
  testID,
  tx,
  onPress,
}: {
  testID: string
  tx: ComponentProps<typeof Text>["tx"]
  onPress: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <Pressable testID={testID} accessibilityRole="button" style={themed($item)} onPress={onPress}>
      <Text tx={tx} weight="medium" numberOfLines={1} maxFontSizeMultiplier={MENU_MAX_FONT_SCALE} />
    </Pressable>
  )
}

const MENU_MAX_FONT_SCALE = 1.5
const ITEM_HEIGHT = 54

const $slot: ViewStyle = { width: 92, height: 44, zIndex: 80 }
const $compactSlot: ViewStyle = { width: 44, height: 44, zIndex: 80 }
const $backdrop: ViewStyle = {
  position: "absolute",
  top: -1000,
  right: -1000,
  bottom: -1000,
  left: -1000,
}
const $fill: ViewStyle = { ...StyleSheet.absoluteFill }
const $menu: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  overflow: "hidden",
  borderWidth: 1,
  borderColor: colors.separator,
  backgroundColor: colors.surface,
})
const $boardTrigger: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 44,
  height: 44,
  borderRadius: 22,
  overflow: "hidden",
  borderWidth: 1,
  borderColor: colors.separator,
  backgroundColor: colors.surface,
})
const $boardSheet: ThemedStyle<ViewStyle> = ({ colors }) => ({
  padding: 0,
  gap: 0,
  borderRadius: 16,
  overflow: "hidden",
  backgroundColor: colors.surface,
})
const $topRight: ViewStyle = { right: 0, top: 0 }
const $bottomLeft: ViewStyle = { bottom: 0, left: 0 }
const $trigger: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
})
const $dotsRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
}
const $dot: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 5,
  height: 5,
  borderRadius: radius.full,
  backgroundColor: colors.text,
})
const $items: ThemedStyle<ViewStyle> = () => ({ justifyContent: "center" })
const $item: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  justifyContent: "center",
  paddingHorizontal: spacing.md,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.separator,
})
const $storeUpdateText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $settingsItem: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: spacing.xs,
})
const $inlineUpdateDot: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 7,
  height: 7,
  borderRadius: radius.full,
  backgroundColor: colors.tint,
})
const $updateDot: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  position: "absolute",
  top: 7,
  right: 7,
  width: 8,
  height: 8,
  borderRadius: radius.full,
  backgroundColor: colors.tint,
})
