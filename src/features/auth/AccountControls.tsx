import { Pressable, type TextStyle, View, type ViewStyle } from "react-native"
import { UserProfileView } from "@clerk/expo/native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { AccountProfileProps } from "./accountProfileProps"

export function AccountProfile({ onBack, accountControls }: AccountProfileProps) {
  const { themed } = useAppTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={$profile}>
      <UserProfileView isDismissible={false} style={$profile} />
      {accountControls ? (
        <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>{accountControls}</View>
      ) : null}
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          style={[$backButton, { top: insets.top + 14 }]}
          onPress={onBack}
        >
          <Text text="Back" style={themed($backText)} />
        </Pressable>
      ) : null}
    </View>
  )
}

const $profile = { flex: 1 } as const
const $backButton: ViewStyle = { position: "absolute", left: 20, zIndex: 1 }
const $backText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
