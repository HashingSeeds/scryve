import type { ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ActivityIndicator, View } from "react-native"

import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function NearbyStatusScreen({
  title,
  message,
  busy = false,
  actions,
  onBack,
}: {
  title?: string
  message: string
  busy?: boolean
  actions?: ReactNode
  onBack: () => void
}) {
  const { themed, theme } = useAppTheme()
  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <Header
        title=""
        leftTx="common:back"
        backgroundColor={theme.colors.surface}
        onLeftPress={onBack}
      />
      <View style={themed($center)}>
        {busy ? <ActivityIndicator color={theme.colors.textDim} /> : null}
        {title ? (
          <Text preset="subheading" accessibilityRole="header" style={$centered} text={title} />
        ) : null}
        <Text
          size="sm"
          accessibilityRole={busy ? "progressbar" : "alert"}
          accessibilityLiveRegion="polite"
          tone="dim"
          style={$centered}
          text={message}
        />
        {actions ? <View style={themed($actions)}>{actions}</View> : null}
      </View>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.surface,
})
const $center: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.sm,
  padding: spacing.lg,
  paddingBottom: spacing.xxxl,
})
const $centered: TextStyle = { textAlign: "center", maxWidth: 360 }
const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "stretch",
  alignItems: "center",
  marginTop: spacing.sm,
})
