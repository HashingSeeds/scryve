import { ReactNode, useCallback, useEffect, useRef, useState } from "react"
import {
  KeyboardAvoidingView,
  KeyboardAvoidingViewProps,
  LayoutChangeEvent,
  Platform,
  ScrollViewProps,
  StyleProp,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native"
import { SystemBars, SystemBarsProps, SystemBarStyle } from "react-native-edge-to-edge"
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { BottomInsetClaimContext } from "@/components/BottomActionBar"
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
  /** why: a game board lays out to the screen edges and keeps its own chrome clear of the camera, so it skips the side safe-area gutter every other screen gets. */
  fullWidth?: boolean
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
    fullWidth,
  } = props
  const { titleVisible, onScroll: onTitleScroll } = useCollapsingTitle()
  const { collapseTitle = true, ...headerProps } = props.header ?? {}
  const collapsesTitle = Boolean(props.header) && !isNonScrolling(props.preset) && collapseTitle
  const showHeaderTitle = !collapsesTitle || titleVisible
  const screenProps = collapsesTitle
    ? withTitleScrollHandler(props as ScrollScreenProps, onTitleScroll)
    : props

  const [bottomInsetClaims, setBottomInsetClaims] = useState(0)
  const claimBottomInset = useCallback(() => {
    setBottomInsetClaims((claims) => claims + 1)
    return () => setBottomInsetClaims((claims) => claims - 1)
  }, [])
  const sideGutter = useSideSafeAreaGutter(!fullWidth)
  const $containerInsets = useSafeAreaInsetsStyle(
    bottomInsetClaims > 0 ? safeAreaEdges?.filter((edge) => edge !== "bottom") : safeAreaEdges,
  )

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
        style={[$styles.flex1, sideGutter, KeyboardAvoidingViewProps?.style]}
      >
        <BottomInsetClaimContext.Provider value={claimBottomInset}>
          {isNonScrolling(screenProps.preset) ? (
            <ScreenWithoutScrolling {...screenProps} />
          ) : (
            <ScreenWithScrolling {...screenProps} />
          )}
        </BottomInsetClaimContext.Provider>
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

/** why: the closed iPhone Duo puts the status bar and system controls in a rail down one side and reports it as that side's safe-area inset; content stops at the rail like a native app's. It is the only portrait screen whose side inset beats its top, so landscape notches keep their layout. Screen content pads itself by at least `spacing.md`, so the gutter adds only what the rail needs beyond that, instead of stacking the two. */
function useSideSafeAreaGutter(enabled: boolean): ViewStyle | undefined {
  const { top, left, right } = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const {
    theme: { spacing },
  } = useAppTheme()
  if (!enabled || height <= width || Math.max(left, right) <= top) return undefined
  return {
    paddingLeft: Math.max(left - spacing.md, 0),
    paddingRight: Math.max(right - spacing.md, 0),
  }
}
