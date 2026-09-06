import { useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { CHOICE_RADIUS } from "./ChoiceButton"
import { Text } from "./Text"

export interface SelectOption {
  id: string
  label: string
  detail?: string
}

export interface SelectFieldProps {
  label: string
  options: readonly SelectOption[]
  value?: string
  placeholder?: string
  clearLabel?: string
  testID?: string
  onSelect: (id?: string) => void
}

export type Anchor = { x: number; y: number; width: number; height: number }

const ANCHOR_GAP = 6
const SCREEN_MARGIN = 12
const MIN_MENU_HEIGHT = 180
const OPEN_SPRING = { damping: 18, stiffness: 260, mass: 0.6 } as const

export function menuPlacement(
  anchor: Anchor,
  windowHeight: number,
): { dropsDown: boolean; style: ViewStyle } {
  const spaceBelow = windowHeight - (anchor.y + anchor.height) - SCREEN_MARGIN
  const spaceAbove = anchor.y - SCREEN_MARGIN
  const dropsDown = spaceBelow >= MIN_MENU_HEIGHT || spaceBelow >= spaceAbove
  return {
    dropsDown,
    style: {
      position: "absolute",
      left: anchor.x,
      width: anchor.width,
      maxHeight: Math.max(0, (dropsDown ? spaceBelow : spaceAbove) - ANCHOR_GAP),
      ...(dropsDown
        ? { top: anchor.y + anchor.height + ANCHOR_GAP }
        : { bottom: windowHeight - anchor.y + ANCHOR_GAP }),
    },
  }
}

export function SelectField({
  label,
  options,
  value,
  placeholder = "None",
  clearLabel,
  testID,
  onSelect,
}: SelectFieldProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { height: windowHeight } = useWindowDimensions()
  const reducedMotion = useReducedMotion()
  const trigger = useRef<View>(null)
  const [anchor, setAnchor] = useState<Anchor>()
  const [open, setOpen] = useState(false)
  const entrance = useSharedValue(1)
  const selected = options.find((option) => option.id === value)

  function show() {
    entrance.value = reducedMotion === false ? 0 : 1
    setAnchor(undefined)
    const currentTrigger = trigger.current
    if (!currentTrigger) {
      setOpen(true)
      if (reducedMotion === false) entrance.value = withSpring(1, OPEN_SPRING)
      return
    }
    let measured = false
    currentTrigger.measureInWindow((x, y, width, height) => {
      measured = true
      setAnchor({ x, y, width, height })
      setOpen(true)
      if (reducedMotion === false) entrance.value = withSpring(1, OPEN_SPRING)
    })
    if (!measured) setOpen(true)
  }

  function choose(id?: string) {
    setOpen(false)
    if (id !== value) onSelect(id)
  }

  const placement = anchor ? menuPlacement(anchor, windowHeight) : undefined
  const dropsDown = placement?.dropsDown ?? true

  const $entrance = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (dropsDown ? -1 : 1) * ANCHOR_GAP * (1 - entrance.value) },
      { scaleY: 0.94 + 0.06 * entrance.value },
    ],
  }))

  return (
    <View>
      <Pressable
        ref={trigger}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${selected?.label ?? placeholder}`}
        accessibilityHint={`Opens the ${label.toLowerCase()} choices`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [themed($trigger), pressed && themed($triggerPressed)]}
        onPress={show}
      >
        <View style={themed($triggerText)}>
          <Text text={label} size="xxs" style={themed($triggerLabel)} />
          <Text
            text={selected?.label ?? placeholder}
            numberOfLines={1}
            style={[themed($triggerValue), !selected && { color: colors.textDim }]}
          />
        </View>
        <Text text={dropsDown || !open ? "▾" : "▴"} style={themed($caret)} />
      </Pressable>
      <Modal transparent visible={open} animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable
          testID={testID ? `${testID}-backdrop` : undefined}
          accessibilityRole="button"
          accessibilityLabel={`Close ${label.toLowerCase()} choices`}
          style={[StyleSheet.absoluteFill, themed($scrim)]}
          onPress={() => setOpen(false)}
        />
        <Animated.View
          testID={testID ? `${testID}-menu` : undefined}
          accessibilityViewIsModal
          style={[themed($menu), placement?.style ?? themed($menuFallback), $entrance]}
        >
          <ScrollView contentContainerStyle={themed($menuContent)}>
            {clearLabel ? (
              <MenuOption
                testID={testID ? `${testID}-option-none` : undefined}
                label={clearLabel}
                selected={value === undefined}
                divided
                onPress={() => choose(undefined)}
              />
            ) : null}
            {options.map((option) => (
              <MenuOption
                key={option.id}
                testID={testID ? `${testID}-option-${option.id}` : undefined}
                label={option.label}
                detail={option.detail}
                selected={option.id === value}
                onPress={() => choose(option.id)}
              />
            ))}
          </ScrollView>
        </Animated.View>
      </Modal>
    </View>
  )
}

function MenuOption({
  label,
  detail,
  selected,
  divided,
  testID,
  onPress,
}: {
  label: string
  detail?: string
  selected: boolean
  divided?: boolean
  testID?: string
  onPress: () => void
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  return (
    <Pressable
      testID={testID}
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        themed($optionRow),
        divided && themed($optionDivider),
        selected && themed($optionSelected),
        pressed && themed($optionPressed),
      ]}
      onPress={onPress}
    >
      <View style={themed($optionText)}>
        <Text text={label} numberOfLines={1} style={themed($optionLabel)} />
        {detail ? (
          <Text size="xs" text={detail} numberOfLines={2} style={themed($optionDetail)} />
        ) : null}
      </View>
      {selected ? <Text text="✓" style={[themed($optionCheck), { color: colors.tint }]} /> : null}
    </Pressable>
  )
}

const $trigger: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 56,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.sm,
  borderRadius: CHOICE_RADIUS,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.palette.neutral100,
})
const $triggerPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
})
const $triggerText: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $triggerLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  letterSpacing: 1.2,
  textTransform: "uppercase",
})
const $triggerValue: ThemedStyle<TextStyle> = () => ({ fontWeight: "600" })
const $caret: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim, lineHeight: 20 })
const $scrim: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.overlay20,
})
const $menu: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: CHOICE_RADIUS,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.background,
  shadowColor: colors.palette.neutral900,
  shadowOffset: { width: 0, height: spacing.xxs },
  shadowOpacity: 0.35,
  shadowRadius: spacing.md,
  elevation: 16,
})
const $menuFallback: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "center",
  marginTop: spacing.xxl,
  width: "80%",
  maxHeight: MIN_MENU_HEIGHT * 2,
})
const $menuContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ paddingVertical: spacing.xxs })
const $optionRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
})
const $optionDivider: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderBottomWidth: 1,
  borderColor: colors.separator,
  marginBottom: spacing.xxs,
  paddingBottom: spacing.sm,
})
const $optionSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
})
const $optionPressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral300,
})
const $optionText: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $optionLabel: ThemedStyle<TextStyle> = () => ({ fontWeight: "600" })
const $optionDetail: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $optionCheck: ThemedStyle<TextStyle> = () => ({ fontWeight: "700", lineHeight: 20 })
