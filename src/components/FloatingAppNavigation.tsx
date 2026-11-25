import { useState } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { type AccountEntry, AppUtilityMenu } from "./AppUtilityMenu"

export function FloatingAppNavigation({
  onDecks,
  onHistory,
  onSettings,
  onSupport,
  onAccount,
  accountEntry = "account",
}: {
  onDecks?: () => void
  onHistory: () => void
  onSettings: () => void
  onSupport: () => void
  onAccount: () => void
  accountEntry?: AccountEntry
}) {
  const { themed, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [utilityHeight, setUtilityHeight] = useState(0)

  return (
    <View
      testID="floating-app-navigation"
      pointerEvents="box-none"
      style={[
        themed($navigation),
        utilityHeight > 0 && { height: utilityHeight },
        { bottom: Math.max(insets.bottom, theme.spacing.md) },
      ]}
    >
      <View style={$utility}>
        <AppUtilityMenu
          compact
          placement="bottomLeft"
          accountEntry={accountEntry}
          onDecks={onDecks}
          onHistory={onHistory}
          onSettings={onSettings}
          onSupport={onSupport}
          onAccount={onAccount}
          onOpenHeightChange={setUtilityHeight}
        />
      </View>
    </View>
  )
}

const $navigation: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  zIndex: 50,
  start: spacing.md,
  end: spacing.md,
  height: 48,
  alignItems: "center",
  justifyContent: "flex-end",
})
const $utility: ViewStyle = { position: "absolute", start: 0, bottom: 0, zIndex: 1 }
