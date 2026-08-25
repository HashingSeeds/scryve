import { View, type ViewStyle } from "react-native"

import { ListItem } from "@/components/ListItem"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function AccountDataControls({ onOpen }: { onOpen: () => void }) {
  const { themed } = useAppTheme()

  return (
    <View style={themed($container)}>
      <ListItem
        testID="account-data-button"
        text="Account & data"
        accessibilityLabel="Account and data"
        accessibilityHint="Opens account deletion and data details"
        rightIcon="caretRight"
        height={48}
        onPress={onOpen}
      />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 48,
  paddingHorizontal: spacing.lg,
  borderTopWidth: 1,
  borderColor: colors.separator,
  backgroundColor: colors.palette.neutral100,
})
