import type { ViewStyle } from "react-native"
import { Modal, Pressable, View } from "react-native"

import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { ClerkAuthView } from "./ClerkAuthView"

export function ClerkAuthModal({
  visible,
  onDismiss,
}: {
  visible: boolean
  onDismiss: () => void
}) {
  const { themed } = useAppTheme()

  const closeLabel = translate("account:cloud.closeSignIn")
  return (
    <Modal
      testID="auth-modal"
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={themed($modal)}>
        <View style={themed($header)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            onPress={onDismiss}
            style={themed($closeButton)}
          >
            <Text preset="bold" tx="common:close" />
          </Pressable>
        </View>
        <ClerkAuthView onDismiss={onDismiss} />
      </View>
    </Modal>
  )
}

const $modal: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})
const $header: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.xxs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $closeButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  minWidth: 44,
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
})
