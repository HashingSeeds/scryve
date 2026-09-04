import { useState } from "react"
import type { ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

import { AppUtilityMenu } from "./AppUtilityMenu"
import { Text } from "./Text"

export function FloatingAppNavigation({
  destinationLabel,
  onDestination,
  onSettings,
  onAccount,
  accountLabel = "Account",
}: {
  destinationLabel: "Decks" | "Return to game" | "Play"
  onDestination: () => void
  onSettings: () => void
  onAccount: () => void
  accountLabel?: "Account" | "Sign in"
}) {
  const { themed } = useAppTheme()
  const safeArea = useSafeAreaInsetsStyle(["bottom"], "margin")
  const [utilityOpen, setUtilityOpen] = useState(false)

  return (
    <View
      testID="floating-app-navigation"
      pointerEvents="box-none"
      style={[themed($navigation), utilityOpen && $expandedNavigation, safeArea]}
    >
      <View style={$utility}>
        <AppUtilityMenu
          compact
          placement="bottomLeft"
          accountLabel={accountLabel}
          onSettings={onSettings}
          onAccount={onAccount}
          onOpenChange={setUtilityOpen}
        />
      </View>
      <Pressable
        testID="open-decks-button"
        accessibilityRole="button"
        accessibilityLabel={destinationLabel}
        style={themed($destination)}
        onPress={onDestination}
      >
        <Text text={destinationLabel} weight="bold" size="xs" />
      </Pressable>
    </View>
  )
}

const $navigation: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  zIndex: 50,
  left: spacing.md,
  right: spacing.md,
  bottom: spacing.md,
  height: 48,
  alignItems: "center",
  justifyContent: "flex-end",
})
const $expandedNavigation: ViewStyle = { height: 108 }
const $utility: ViewStyle = { position: "absolute", left: 0, bottom: 0 }
const $destination: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minWidth: 92,
  height: 44,
  marginBottom: 2,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: colors.separator,
  borderRadius: 22,
  backgroundColor: colors.background,
  paddingHorizontal: spacing.md,
})
