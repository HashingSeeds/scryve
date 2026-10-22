import type { ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, useWindowDimensions, View } from "react-native"

import { BottomActionBar } from "@/components/BottomActionBar"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

// why: the fixed preset never hides its nav title, so this collapses it itself; the in-body heading would show twice otherwise.
export function FeedbackLayout({
  title,
  offline,
  onBack,
  footer,
  children,
}: {
  title: string
  offline: boolean
  onBack: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const { themed } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()
  // why: at the largest text sizes a pinned footer covers most of the screen, so it scrolls with the content instead.
  const pinFooter = useWindowDimensions().fontScale <= MAX_PINNED_FONT_SCALE
  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      header={{
        title: titleVisible ? title : undefined,
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
        <Text text={title} preset="heading" accessibilityRole="header" />
        {children}
        {footer && !pinFooter ? <View style={themed($inlineFooter)}>{footer}</View> : null}
      </ScrollView>
      {footer && pinFooter ? <BottomActionBar>{footer}</BottomActionBar> : null}
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
