import type { ViewStyle } from "react-native"
import { Modal, Platform, View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

import { ClerkAuthView } from "./ClerkAuthView"

// why: Clerk's native view draws its own close button and asks for legal consent at sign-up.
export function ClerkAuthModal({
  visible,
  onDismiss,
}: {
  visible: boolean
  onDismiss: () => void
}) {
  const { themed } = useAppTheme()
  // why: Android shows this modal full screen and edge-to-edge, under the status bar; iOS presents a page sheet below it.
  const androidTopInset = useSafeAreaInsetsStyle(["top"])

  return (
    <Modal
      testID="auth-modal"
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={[themed($modal), Platform.OS === "android" && androidTopInset]}>
        <ClerkAuthView onDismiss={onDismiss} />
      </View>
    </Modal>
  )
}

const $modal: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})
