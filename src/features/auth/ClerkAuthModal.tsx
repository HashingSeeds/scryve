import {
  Modal,
  Pressable,
  // eslint-disable-next-line no-restricted-imports
  Text as NativeText,
  View,
} from "react-native"

import { colors } from "@/theme/colorsDark"

import { ClerkAuthView } from "./ClerkAuthView"

export function ClerkAuthModal({
  visible,
  onDismiss,
}: {
  visible: boolean
  onDismiss: () => void
}) {
  return (
    <Modal
      testID="auth-modal"
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={$modal}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close sign in"
          onPress={onDismiss}
          style={$closeButton}
        >
          <NativeText style={$closeText}>Close</NativeText>
        </Pressable>
        <ClerkAuthView onDismiss={onDismiss} />
      </View>
    </Modal>
  )
}

const $modal = { flex: 1, paddingTop: 12, backgroundColor: colors.background } as const
const $closeButton = { minHeight: 44, padding: 12, alignSelf: "flex-start" } as const
const $closeText = { color: colors.text, fontFamily: "spaceGroteskMedium", fontSize: 16 } as const
