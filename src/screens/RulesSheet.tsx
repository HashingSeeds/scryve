import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Keyboard, Pressable, StyleSheet, useWindowDimensions, View } from "react-native"
import type { ViewStyle } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useCloseOnBack } from "@/utils/useCloseOnBack"
import { useReducedMotion } from "@/utils/useReducedMotion"

const SHEET_HEIGHT_RATIO = 0.82
const SHEET_DISMISS_DISTANCE = 110
const SHEET_DISMISS_VELOCITY = 700
const RUBBER_BAND_MAX = 28
const RUBBER_BAND_FACTOR = 0.22
const SHEET_OPEN_MS = 380
const SHEET_CLOSE_MS = 280
const PUSH_MS = 320
const POP_MS = 280
const BACK_SWIPE_RATIO = 0.3
const BACK_SWIPE_VELOCITY = 500
const PARALLAX_RATIO = 0.24
const SHEET_SPRING = { damping: 32, stiffness: 360, mass: 0.9 } as const
const IOS_EASE = Easing.bezier(0.32, 0.72, 0, 1)

function rubberBandUp(distance: number) {
  "worklet"
  const scaled = distance * RUBBER_BAND_FACTOR
  return -((RUBBER_BAND_MAX * scaled) / (RUBBER_BAND_MAX + scaled))
}

export type SheetDragGesture = ReturnType<typeof Gesture.Pan>

export interface RulesSheetLayer {
  key: string
  render: (controls: {
    active: boolean
    opened: boolean
    dragGesture: SheetDragGesture
    onOverscrollDismiss: () => void
  }) => ReactNode
}

export interface RulesSheetProps {
  layers: readonly RulesSheetLayer[]
  poppingKey?: string
  onRequestPop: () => void
  onPopped: (key: string) => void
  onDismiss: () => void
}

export function RulesSheet({
  layers,
  poppingKey,
  onRequestPop,
  onPopped,
  onDismiss,
}: RulesSheetProps) {
  const { themeContext, themed } = useAppTheme()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const reducedMotion = useReducedMotion()
  const sheetHeight = Math.round(windowHeight * SHEET_HEIGHT_RATIO)
  const translateY = useSharedValue(reducedMotion ? 0 : sheetHeight)
  const [opened, setOpened] = useState(Boolean(reducedMotion))
  const interactiveBack = useSharedValue(0)
  const dismissing = useRef(false)

  const resetDismissing = useCallback(() => {
    dismissing.current = false
  }, [])

  const dismiss = useCallback(() => {
    if (dismissing.current) return
    dismissing.current = true
    Keyboard.dismiss()
    if (reducedMotion) {
      onDismiss()
      return
    }
    translateY.set(
      withTiming(sheetHeight, { duration: SHEET_CLOSE_MS, easing: IOS_EASE }, (finished) => {
        if (finished) runOnJS(onDismiss)()
        else runOnJS(resetDismissing)()
      }),
    )
  }, [onDismiss, reducedMotion, resetDismissing, sheetHeight, translateY])

  useCloseOnBack(true, () => {
    if (layers.length > 1) {
      onRequestPop()
      return
    }
    dismiss()
  })

  const makePan = useCallback(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 10])
        .failOffsetX([-18, 18])
        .onUpdate((event) => {
          translateY.set(
            event.translationY < 0 ? rubberBandUp(-event.translationY) : event.translationY,
          )
        })
        .onEnd((event) => {
          if (
            event.translationY > SHEET_DISMISS_DISTANCE ||
            event.velocityY > SHEET_DISMISS_VELOCITY
          ) {
            runOnJS(dismiss)()
            return
          }
          translateY.set(
            withSpring(0, SHEET_SPRING, (finished) => {
              if (finished) runOnJS(setOpened)(true)
            }),
          )
        }),
    [dismiss, translateY],
  )

  const grabberPan = useMemo(() => makePan(), [makePan])

  useEffect(() => {
    if (reducedMotion) {
      translateY.set(0)
      setOpened(true)
      return
    }
    translateY.set(
      withTiming(0, { duration: SHEET_OPEN_MS, easing: IOS_EASE }, (finished) => {
        if (finished) runOnJS(setOpened)(true)
      }),
    )
  }, [reducedMotion, translateY])

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, Math.max(sheetHeight, 1)], [1, 0], "clamp"),
  }))
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  const dark = themeContext === "dark"
  const activeIndex =
    poppingKey && layers[layers.length - 1]?.key === poppingKey
      ? Math.max(0, layers.length - 2)
      : layers.length - 1

  const handlePopped = useCallback(
    (key: string) => {
      onPopped(key)
    },
    [onPopped],
  )

  return (
    <View style={$sheetRoot}>
      <Animated.View style={[StyleSheet.absoluteFill, themed($sheetBackdrop), backdropStyle]}>
        <Pressable
          testID="rules-sheet-backdrop"
          accessibilityRole="button"
          accessibilityLabel={translate("common:close")}
          style={$flex}
          onPress={dismiss}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          themed($sheet),
          dark ? $sheetRimDark : $sheetRimLight,
          {
            height: sheetHeight + RUBBER_BAND_MAX,
            marginBottom: -RUBBER_BAND_MAX,
            paddingBottom: RUBBER_BAND_MAX,
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={grabberPan}>
          <View style={$grabberRow}>
            <View style={[$grabber, dark ? $grabberDark : $grabberLight]} />
          </View>
        </GestureDetector>
        <View style={$layerStack}>
          {layers.map((layer, index) => (
            <SheetLayerView
              key={layer.key}
              layer={layer}
              index={index}
              active={index === activeIndex}
              opened={opened}
              covered={index < activeIndex}
              directlyUnderTop={index === layers.length - 2}
              popping={layer.key === poppingKey}
              windowWidth={windowWidth}
              reducedMotion={Boolean(reducedMotion)}
              interactiveBack={interactiveBack}
              makePan={makePan}
              onOverscrollDismiss={dismiss}
              onPopped={() => handlePopped(layer.key)}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  )
}

function SheetLayerView({
  layer,
  index,
  active,
  opened,
  covered,
  directlyUnderTop,
  popping,
  windowWidth,
  reducedMotion,
  interactiveBack,
  makePan,
  onOverscrollDismiss,
  onPopped,
}: {
  layer: RulesSheetLayer
  index: number
  active: boolean
  opened: boolean
  covered: boolean
  directlyUnderTop: boolean
  popping: boolean
  windowWidth: number
  reducedMotion: boolean
  interactiveBack: SharedValue<number>
  makePan: () => SheetDragGesture
  onOverscrollDismiss: () => void
  onPopped: () => void
}) {
  const { themed } = useAppTheme()
  const isBase = index === 0
  const enter = useSharedValue(isBase || reducedMotion ? 1 : 0)
  const cover = useSharedValue(covered ? 1 : 0)
  const dragGesture = useMemo(() => makePan(), [makePan])

  const dismissKeyboard = useCallback(() => Keyboard.dismiss(), [])

  const backPan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!isBase && active && !popping)
        .activeOffsetX(14)
        .failOffsetY([-12, 12])
        .onUpdate((event) => {
          const width = Math.max(windowWidth, 1)
          const fraction = Math.max(0, Math.min(1, event.translationX / width))
          enter.set(1 - fraction)
          interactiveBack.set(fraction)
        })
        .onEnd((event) => {
          const width = Math.max(windowWidth, 1)
          const shouldPop =
            event.translationX > width * BACK_SWIPE_RATIO || event.velocityX > BACK_SWIPE_VELOCITY
          if (shouldPop) {
            runOnJS(dismissKeyboard)()
            const remaining = Math.max(0.15, enter.value)
            const duration = Math.max(120, Math.round(POP_MS * remaining))
            interactiveBack.set(withTiming(1, { duration, easing: IOS_EASE }))
            enter.set(
              withTiming(0, { duration, easing: IOS_EASE }, (finished) => {
                if (finished) runOnJS(onPopped)()
              }),
            )
            return
          }
          interactiveBack.set(withSpring(0, SHEET_SPRING))
          enter.set(withSpring(1, SHEET_SPRING))
        }),
    [active, dismissKeyboard, enter, interactiveBack, isBase, onPopped, popping, windowWidth],
  )

  useEffect(() => {
    if (isBase) return
    if (popping) {
      if (reducedMotion) {
        onPopped()
        return
      }
      enter.set(
        withTiming(0, { duration: POP_MS, easing: IOS_EASE }, (finished) => {
          if (finished) runOnJS(onPopped)()
        }),
      )
      return
    }
    if (reducedMotion) {
      enter.set(1)
      return
    }
    enter.set(withTiming(1, { duration: PUSH_MS, easing: IOS_EASE }))
  }, [enter, isBase, onPopped, popping, reducedMotion])

  useEffect(() => {
    if (reducedMotion || (!covered && interactiveBack.value > 0.5)) {
      cover.set(covered ? 1 : 0)
      if (!covered) interactiveBack.set(0)
      return
    }
    cover.set(
      withTiming(covered ? 1 : 0, { duration: covered ? PUSH_MS : POP_MS, easing: IOS_EASE }),
    )
  }, [cover, covered, interactiveBack, reducedMotion])

  const layerStyle = useAnimatedStyle(() => {
    const enterX = isBase ? 0 : interpolate(enter.value, [0, 1], [windowWidth, 0])
    const effectiveCover = directlyUnderTop
      ? Math.max(0, cover.value - interactiveBack.value)
      : cover.value
    const coverX = interpolate(effectiveCover, [0, 1], [0, -windowWidth * PARALLAX_RATIO])
    return {
      transform: [{ translateX: enterX + coverX }],
    }
  })

  const dimStyle = useAnimatedStyle(() => {
    const effectiveCover = directlyUnderTop
      ? Math.max(0, cover.value - interactiveBack.value)
      : cover.value
    return {
      opacity: interpolate(effectiveCover, [0, 1], [0, 0.14]),
    }
  })

  const content = (
    <Animated.View
      pointerEvents={active ? "auto" : "none"}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[StyleSheet.absoluteFill, themed($layer), layerStyle]}
    >
      {layer.render({ active, opened, dragGesture, onOverscrollDismiss })}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, $layerDim, dimStyle]} />
    </Animated.View>
  )

  return isBase ? content : <GestureDetector gesture={backPan}>{content}</GestureDetector>
}

const $flex: ViewStyle = { flex: 1 }
const $sheetRoot: ViewStyle = { flex: 1, justifyContent: "flex-end" }
const $sheetBackdrop: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.overlay,
})
const $sheet: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
  borderTopLeftRadius: 32,
  borderTopRightRadius: 32,
  borderCurve: "continuous",
  borderTopWidth: StyleSheet.hairlineWidth,
  overflow: "hidden",
})
const $sheetRimDark: ViewStyle = { borderColor: "rgba(255, 255, 255, 0.14)" }
const $sheetRimLight: ViewStyle = { borderColor: "rgba(0, 0, 0, 0.08)" }
const $grabberRow: ViewStyle = {
  alignItems: "center",
  paddingTop: 6,
  paddingBottom: 10,
}
const $grabber: ViewStyle = {
  width: 36,
  height: 4,
  borderRadius: 2,
}
const $grabberDark: ViewStyle = { backgroundColor: "rgba(235, 235, 245, 0.3)" }
const $grabberLight: ViewStyle = { backgroundColor: "rgba(60, 60, 67, 0.3)" }
const $layerStack: ViewStyle = { flex: 1, overflow: "hidden" }
const $layer: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.background })
const $layerDim: ViewStyle = { backgroundColor: "#000000" }
