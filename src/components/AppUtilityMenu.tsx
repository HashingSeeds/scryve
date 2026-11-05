import { useEffect, useState, type ReactNode } from "react"
import type { PressableProps, TextStyle, ViewStyle } from "react-native"
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

import { Icon, type IconTypes } from "./Icon"
import { Text, type TextProps } from "./Text"

export type AccountEntry = "account" | "signIn"

export function AppUtilityMenu({
  visible = true,
  compact = false,
  placement = "topRight",
  onDecks,
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
  placement?: "topRight" | "bottomLeft"
  onDecks?: () => void
  onHistory: () => void
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
  const updateReady = useAppUpdate().status === "ready"
  const storeUpdate = useStoreUpdate()
  const nearbyOnly = useNearbyOnly()
  const testsNearby = nearbyBetaAvailable()
  const showsEvents = nearbyOnly || readPublicCloudConfig().configured
  const itemCount =
    4 +
    Number(Boolean(onDecks)) +
    Number(testsNearby) +
    Number(Boolean(storeUpdate)) +
    Number(showsEvents)
  const openWidth = compact ? (testsNearby ? 208 : 180) : 220
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
            onPress={() => {
              setOpen(true)
              onOpenHeightChange?.(ITEM_HEIGHT * itemCount)
            }}
          >
            {compact ? (
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
            {updateReady || storeUpdate ? (
              <View testID="utility-update-dot" style={themed($updateDot)} />
            ) : null}
          </Pressable>
        </Animated.View>
        <Animated.View
          pointerEvents={open ? "auto" : "none"}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? "auto" : "no-hide-descendants"}
          style={[$fill, themed($items), itemsStyle]}
        >
          {storeUpdate ? (
            <MenuItem
              testID="utility-store-update-button"
              icon="update"
              tx="common:appMenu.updateApp"
              accessibilityRole="link"
              accessibilityLabel={translate(storeUpdate.labelTx)}
              tone="tint"
              onPress={() => choose(updateFromStore)}
            />
          ) : null}
          {onDecks ? (
            <MenuItem
              testID="utility-decks-button"
              icon="decks"
              tx="common:appNavigation.decks"
              onPress={() => choose(onDecks)}
            />
          ) : null}
          <MenuItem
            testID="utility-history-button"
            icon="history"
            tx="common:appMenu.history"
            onPress={() => choose(onHistory)}
          />
          {showsEvents ? (
            <MenuItem
              testID="utility-events-button"
              icon="events"
              tx="events:title"
              onPress={() => choose(() => openEvents(nearbyOnly))}
            />
          ) : null}
          {testsNearby ? (
            <MenuItem
              testID="utility-nearby-only-button"
              icon="nearby"
              tx={nearbyOnly ? "common:appMenu.nearbyOnlyOn" : "common:appMenu.nearbyOnlyOff"}
              accessibilityRole="switch"
              accessibilityState={{ checked: nearbyOnly }}
              onPress={() => choose(() => setNearbyOnly(!nearbyOnly))}
            />
          ) : null}
          <MenuItem
            testID="utility-account-button"
            icon="account"
            tx={`common:appMenu.${accountEntry}`}
            onPress={() => choose(onAccount)}
          />
          <MenuItem
            testID="utility-support-button"
            icon="support"
            tx="common:appMenu.support"
            onPress={() => choose(onSupport)}
          />
          <MenuItem
            testID="utility-settings-button"
            icon="settings"
            tx="common:appMenu.settings"
            accessibilityLabel={translate(
              updateReady ? "common:appMenu.settingsUpdateReady" : "common:appMenu.settings",
            )}
            onPress={() => choose(onSettings)}
          >
            {updateReady ? <View style={themed($inlineUpdateDot)} /> : null}
          </MenuItem>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  )
}

function MenuItem({
  icon,
  tx,
  tone,
  accessibilityRole = "button",
  children,
  ...pressableProps
}: Omit<PressableProps, "children" | "style"> & {
  icon: IconTypes
  tx: TextProps["tx"]
  tone?: "tint"
  children?: ReactNode
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const color = tone === "tint" ? colors.tint : undefined
  return (
    <Pressable {...pressableProps} accessibilityRole={accessibilityRole} style={themed($item)}>
      <Icon icon={icon} size={ICON_SIZE} color={color ?? colors.textDim} />
      <Text
        tx={tx}
        weight={tone === "tint" ? "bold" : "medium"}
        numberOfLines={1}
        maxFontSizeMultiplier={MENU_MAX_FONT_SCALE}
        style={[$label, color ? { color } : undefined]}
      />
      {children}
    </Pressable>
  )
}

const MENU_MAX_FONT_SCALE = 1.5
const ICON_SIZE = 20
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
const $label: TextStyle = { flexShrink: 1 }
const $items: ThemedStyle<ViewStyle> = () => ({ justifyContent: "center" })
const $item: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.md,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.separator,
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
