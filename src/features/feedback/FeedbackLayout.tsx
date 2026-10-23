import type { ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, useWindowDimensions, View } from "react-native"
import { useKeyboardState } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { BottomActionBar } from "@/components/BottomActionBar"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

// why: the fixed preset never hides its nav title, so this collapses it itself; the in-body heading would show twice otherwise.
export function FeedbackLayout({
  title,
  heading = true,
  offline,
  onBack,
  footer,
  children,
}: {
  title: string
  heading?: boolean
  offline: boolean
  onBack: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  const { bottom } = useSafeAreaInsets()
  const keyboardOpen = useKeyboardState((state) => state.isVisible)
  // why: at the largest text sizes a pinned footer covers most of the screen, so it scrolls with the content instead.
  const { fontScale } = useWindowDimensions()
  const pinFooter = Boolean(footer) && fontScale <= MAX_PINNED_FONT_SCALE
  return (
    <Screen
      preset="fixed"
      // why: a pinned footer takes the home indicator or nav bar inset as its own bottom padding, rather than adding its padding on top of it.
      safeAreaEdges={pinFooter ? [] : ["bottom"]}
      header={{
        title: titleVisible || !heading ? title : undefined,
        leftTx: "common:back",
        onLeftPress: onBack,
      }}
      contentContainerStyle={$fill}
    >
      {offline ? (
        <View style={themed($offline)} accessibilityRole="alert">
          <Text tx="feedback:offline" size="xs" style={themed($offlineText)} />
        </View>
      ) : null}
      <ScrollView
        style={$grow}
        contentContainerStyle={themed($content)}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        {heading ? <Text text={title} preset="heading" accessibilityRole="header" /> : null}
        {children}
        {footer && !pinFooter ? <View style={themed($inlineFooter)}>{footer}</View> : null}
      </ScrollView>
      {pinFooter ? (
        <BottomActionBar
          style={{ paddingBottom: keyboardOpen ? spacing.sm : Math.max(bottom, spacing.sm) }}
        >
          {footer}
        </BottomActionBar>
      ) : null}
    </Screen>
  )
}

const MAX_PINNED_FONT_SCALE = 1.35

const $fill: ViewStyle = { flex: 1, justifyContent: "flex-start" }
const $grow: ViewStyle = { flex: 1 }
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.lg,
  gap: spacing.md,
})
const $inlineFooter: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  marginTop: spacing.md,
})
const $offline: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.xs,
  backgroundColor: colors.surfaceRaised,
})
const $offlineText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.text })
