import { View, type ViewStyle } from "react-native"

import { ListItem } from "@/components/ListItem"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function AccountDataControls({ onOpen }: { onOpen: () => void }) {
  const { themed } = useAppTheme()
  const accessibilityLabel = translate("account:accountData.accessibilityLabel")
  const accessibilityHint = translate("account:accountData.accessibilityHint")

  return (
    <View style={themed($container)}>
      <ListItem
        testID="account-data-button"
        tx="account:accountData.label"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        rightIcon="caretRight"
        height={48}
        onPress={onOpen}
      />
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 48,
  borderTopWidth: 1,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
