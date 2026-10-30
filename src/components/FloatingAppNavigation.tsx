import { useState } from "react"
import type { ViewStyle } from "react-native"
import { Pressable, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { type AccountEntry, AppUtilityMenu } from "./AppUtilityMenu"
import { Text } from "./Text"

export type AppDestination = "decks" | "returnToGame" | "play" | "backToLobby"

export function FloatingAppNavigation({
  destination,
  onDecks,
  onHistory,
  onSettings,
  onSupport,
  onAccount,
  onChoose,
  accountEntry = "account",
}: {
  destination?: { kind: AppDestination; onPress: () => void }
  onDecks?: () => void
  onHistory: () => void
  onSettings: () => void
  onSupport: () => void
  onAccount: () => void
  onChoose?: () => void
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
      <View style={$utilityAboveDestination}>
        <AppUtilityMenu
          compact
          placement="bottomLeft"
          accountEntry={accountEntry}
          onDecks={onDecks}
          onHistory={onHistory}
          onSettings={onSettings}
          onSupport={onSupport}
          onAccount={onAccount}
          onChoose={onChoose}
          onOpenHeightChange={setUtilityHeight}
        />
      </View>
      {destination ? (
        <Pressable
          testID="open-decks-button"
          accessibilityRole="button"
          accessibilityLabel={translate(`common:appNavigation.${destination.kind}`)}
          style={themed($destination)}
          onPress={destination.onPress}
        >
          <Text
            tx={`common:appNavigation.${destination.kind}`}
            weight="bold"
            size="xs"
            numberOfLines={1}
            maxFontSizeMultiplier={1.5}
          />
        </Pressable>
      ) : null}
    </View>
  )
}

const $navigation: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  zIndex: 50,
  left: spacing.md,
  right: spacing.md,
  height: 48,
  alignItems: "center",
  justifyContent: "flex-end",
})
const $utilityAboveDestination: ViewStyle = { position: "absolute", left: 0, bottom: 0, zIndex: 1 }
const $destination: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  minWidth: 92,
  height: 44,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: colors.separator,
  borderRadius: radius.full,
  backgroundColor: colors.surface,
  paddingHorizontal: spacing.md,
})
