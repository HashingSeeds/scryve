import { ReactNode, useCallback, useEffect, useRef, useState } from "react"
import {
  KeyboardAvoidingView,
  KeyboardAvoidingViewProps,
  LayoutChangeEvent,
  Platform,
  ScrollViewProps,
  StyleProp,
  View,
  ViewStyle,
} from "react-native"
import { SystemBars, SystemBarsProps, SystemBarStyle } from "react-native-edge-to-edge"
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller"

import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { Header, type HeaderProps } from "@/components/Header"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { ExtendedEdge, useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const DEFAULT_BOTTOM_OFFSET = 50

interface BaseScreenProps {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
  contentInset?: "standard"
  safeAreaEdges?: ExtendedEdge[]
  backgroundColor?: string
  systemBarStyle?: SystemBarStyle
  keyboardOffset?: number
  /**
   * By how much we scroll up when the keyboard is shown. Defaults to 50.
   */
  keyboardBottomOffset?: number
  SystemBarsProps?: SystemBarsProps
  KeyboardAvoidingViewProps?: KeyboardAvoidingViewProps
  header?: HeaderProps & { collapseTitle?: boolean }
}

interface FixedScreenProps extends BaseScreenProps {
  preset?: "fixed"
}
interface ScrollScreenProps extends BaseScreenProps {
  preset?: "scroll"
  keyboardShouldPersistTaps?: "handled" | "always" | "never"
  ScrollViewProps?: ScrollViewProps
}

interface AutoScreenProps extends Omit<ScrollScreenProps, "preset"> {
  preset?: "auto"
  /**
   * Threshold to trigger the automatic disabling/enabling of scroll ability.
   * Defaults to `{ percent: 0.92 }`.
   */
  scrollEnabledToggleThreshold?: { percent?: number; point?: number }
}

export type ScreenProps = ScrollScreenProps | FixedScreenProps | AutoScreenProps

const isIos = Platform.OS === "ios"

type ScreenPreset = "fixed" | "scroll" | "auto"

function isNonScrolling(preset?: ScreenPreset) {
  return !preset || preset === "fixed"
}

function useAutoPreset(props: AutoScreenProps): {
  scrollEnabled: boolean
  onContentSizeChange: (w: number, h: number) => void
  onLayout: (e: LayoutChangeEvent) => void
} {
  const { preset, scrollEnabledToggleThreshold } = props
  const { percent = 0.92, point = 0 } = scrollEnabledToggleThreshold || {}

  const scrollViewHeight = useRef<null | number>(null)
  const scrollViewContentHeight = useRef<null | number>(null)
  const [scrollEnabled, setScrollEnabled] = useState(true)

  const updateScrollState = useCallback(() => {
    if (scrollViewHeight.current === null || scrollViewContentHeight.current === null) return

    const contentFitsScreen = (function () {
      if (point) {
        return scrollViewContentHeight.current < scrollViewHeight.current - point
      } else {
        return scrollViewContentHeight.current < scrollViewHeight.current * percent
      }
    })()

    setScrollEnabled(!contentFitsScreen)
  }, [percent, point])

  function onContentSizeChange(_w: number, h: number) {
    scrollViewContentHeight.current = h
    updateScrollState()
  }

  function onLayout(e: LayoutChangeEvent) {
    const { height } = e.nativeEvent.layout
    scrollViewHeight.current = height
    updateScrollState()
  }

  useEffect(() => {
    if (preset === "auto") updateScrollState()
  }, [preset, updateScrollState])

  return {
    scrollEnabled: preset === "auto" ? scrollEnabled : true,
    onContentSizeChange,
    onLayout,
  }
}

function ScreenWithoutScrolling(props: ScreenProps) {
  const { themed } = useAppTheme()
  const { style, contentContainerStyle, contentInset, children, preset } = props
  return (
    <View style={[$outerStyle, style]}>
      <View
        style={[
          $innerStyle,
          contentInset === "standard" && themed($standardContent),
          preset === "fixed" && $justifyFlexEnd,
          contentContainerStyle,
        ]}
      >
        {children}
      </View>
    </View>
  )
}

function ScreenWithScrolling(props: ScreenProps) {
  const {
    children,
    keyboardShouldPersistTaps = "handled",
    keyboardBottomOffset = DEFAULT_BOTTOM_OFFSET,
    contentContainerStyle,
    contentInset,
    ScrollViewProps,
    style,
  } = props as ScrollScreenProps

  const ref = useRef<KeyboardAwareScrollViewRef>(null)
  const { themed } = useAppTheme()

  const { scrollEnabled, onContentSizeChange, onLayout } = useAutoPreset(props as AutoScreenProps)

  return (
    <KeyboardAwareScrollView
      bottomOffset={keyboardBottomOffset}
      {...{ keyboardShouldPersistTaps, scrollEnabled, ref }}
      {...ScrollViewProps}
      onLayout={(e) => {
        onLayout(e)
        ScrollViewProps?.onLayout?.(e)
      }}
      onContentSizeChange={(w: number, h: number) => {
        onContentSizeChange(w, h)
        ScrollViewProps?.onContentSizeChange?.(w, h)
      }}
      style={[$outerStyle, ScrollViewProps?.style, style]}
      contentContainerStyle={[
        $innerStyle,
        contentInset === "standard" && themed($standardContent),
        ScrollViewProps?.contentContainerStyle,
        contentContainerStyle,
      ]}
    >
      {children}
    </KeyboardAwareScrollView>
  )
}

export function Screen(props: ScreenProps) {
  const {
    theme: { colors },
    themeContext,
  } = useAppTheme()
  const {
    backgroundColor,
    KeyboardAvoidingViewProps,
    keyboardOffset = 0,
    safeAreaEdges,
    SystemBarsProps,
    systemBarStyle,
  } = props
  const { titleVisible, onScroll: onTitleScroll } = useCollapsingTitle()
  const { collapseTitle = true, ...headerProps } = props.header ?? {}
  const collapsesTitle = Boolean(props.header) && !isNonScrolling(props.preset) && collapseTitle
  const showHeaderTitle = !collapsesTitle || titleVisible
  const screenProps = collapsesTitle
    ? withTitleScrollHandler(props as ScrollScreenProps, onTitleScroll)
    : props

  const $containerInsets = useSafeAreaInsetsStyle(safeAreaEdges)

  const iosBarsAreViewControllerDriven = isIos
  const barsStyle = iosBarsAreViewControllerDriven
    ? undefined
    : systemBarStyle || (themeContext === "dark" ? "light" : "dark")
  const barsHidden = iosBarsAreViewControllerDriven ? undefined : SystemBarsProps?.hidden

  return (
    <View
      style={[
        $containerStyle,
        { backgroundColor: backgroundColor || colors.background },
        $containerInsets,
      ]}
    >
      <SystemBars style={barsStyle} hidden={barsHidden} />

      {props.header ? (
        <Header
          {...headerProps}
          title={showHeaderTitle ? headerProps.title : undefined}
          titleTx={showHeaderTitle ? headerProps.titleTx : undefined}
        />
      ) : null}

      <KeyboardAvoidingView
        behavior={isIos ? "padding" : "height"}
        keyboardVerticalOffset={keyboardOffset}
        {...KeyboardAvoidingViewProps}
        style={[$styles.flex1, KeyboardAvoidingViewProps?.style]}
      >
        {isNonScrolling(screenProps.preset) ? (
          <ScreenWithoutScrolling {...screenProps} />
        ) : (
          <ScreenWithScrolling {...screenProps} />
        )}
      </KeyboardAvoidingView>
    </View>
  )
}

function withTitleScrollHandler(
  props: ScrollScreenProps,
  onTitleScroll: NonNullable<ScrollViewProps["onScroll"]>,
): ScrollScreenProps {
  const consumerOnScroll = props.ScrollViewProps?.onScroll
  return {
    ...props,
    ScrollViewProps: {
      ...props.ScrollViewProps,
      scrollEventThrottle: props.ScrollViewProps?.scrollEventThrottle ?? 16,
      onScroll: (event) => {
        onTitleScroll(event)
        consumerOnScroll?.(event)
      },
    },
  }
}

const $containerStyle: ViewStyle = {
  flex: 1,
  height: "100%",
  width: "100%",
}

const $outerStyle: ViewStyle = {
  flex: 1,
  height: "100%",
  width: "100%",
}

const $justifyFlexEnd: ViewStyle = {
  justifyContent: "flex-end",
}

const $innerStyle: ViewStyle = {
  justifyContent: "flex-start",
  alignItems: "stretch",
}

const $standardContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  gap: spacing.md,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.md,
})
