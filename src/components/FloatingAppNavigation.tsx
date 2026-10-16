import { useState } from "react"
import type { ViewStyle } from "react-native"
import { Pressable, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { type AccountLabel, AppUtilityMenu } from "./AppUtilityMenu"
import { Text } from "./Text"

type DestinationLabel = "Decks" | "Return to game" | "Play" | "Back to lobby"

const destinationLabelTx = {
  "Decks": "common:appNavigation.decks",
  "Return to game": "common:appNavigation.returnToGame",
  "Play": "common:appNavigation.play",
  "Back to lobby": "common:appNavigation.backToLobby",
} as const satisfies Record<DestinationLabel, TxKeyPath>

export function FloatingAppNavigation({
  destinationLabel,
  onDestination,
  onSettings,
  onAccount,
  accountLabel = "Account",
}: {
  destinationLabel: DestinationLabel
  onDestination: () => void
  onSettings: () => void
  onAccount: () => void
  accountLabel?: AccountLabel
}) {
  const { themed, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [utilityOpen, setUtilityOpen] = useState(false)

  return (
    <View
      testID="floating-app-navigation"
      pointerEvents="box-none"
      style={[
        themed($navigation),
        utilityOpen && $expandedNavigation,
        { bottom: Math.max(insets.bottom, theme.spacing.md) },
      ]}
    >
      <View style={$utilityAboveDestination}>
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
        accessibilityLabel={translate(destinationLabelTx[destinationLabel])}
        style={themed($destination)}
        onPress={onDestination}
      >
        <Text
          tx={destinationLabelTx[destinationLabel]}
          weight="bold"
          size="xs"
          numberOfLines={1}
          maxFontSizeMultiplier={1.5}
        />
      </Pressable>
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
const $expandedNavigation: ViewStyle = { height: 108 }
const $utilityAboveDestination: ViewStyle = { position: "absolute", left: 0, bottom: 0, zIndex: 1 }
const $destination: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minWidth: 92,
  height: 44,
  marginBottom: 2,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: colors.separator,
  borderRadius: 22,
  backgroundColor: colors.surface,
  paddingHorizontal: spacing.md,
})
