import type { TextStyle, ViewStyle } from "react-native"
import { Modal, Platform, Pressable, View } from "react-native"
import { router } from "expo-router"
import { Trans } from "react-i18next"

import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

import { ClerkAuthView } from "./ClerkAuthView"

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

  const closeLabel = translate("account:cloud.closeSignIn")
  // why: the sign-in sheet covers the app's routes, so it closes before a document opens.
  const openDocument = (href: "/terms" | "/privacy") => {
    onDismiss()
    router.push(href)
  }
  return (
    <Modal
      testID="auth-modal"
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onDismiss}
    >
      <View style={[themed($modal), Platform.OS === "android" && androidTopInset]}>
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
        <Text size="xs" style={themed($agreement)}>
          <Trans
            i18nKey="account:cloud.signInAgreement"
            components={{
              terms: (
                <Text
                  size="xs"
                  accessibilityRole="link"
                  style={themed($link)}
                  onPress={() => openDocument("/terms")}
                />
              ),
              privacy: (
                <Text
                  size="xs"
                  accessibilityRole="link"
                  style={themed($link)}
                  onPress={() => openDocument("/privacy")}
                />
              ),
            }}
          />
        </Text>
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
const $agreement: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textDim,
  paddingHorizontal: spacing.md,
  paddingTop: spacing.sm,
})
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textDecorationLine: "underline",
})
