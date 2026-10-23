import type { ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, StyleSheet, View } from "react-native"

import { BottomActionBar } from "@/components/BottomActionBar"
import { EmptyState } from "@/components/EmptyState"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

export function EventFrame({
  title,
  access,
  loading = false,
  onBack,
  footer,
  children,
}: {
  title: string
  access?: Pick<CloudAccess, "ready" | "loading" | "message" | "actionLabel" | "request">
  loading?: boolean
  onBack: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const { themed } = useAppTheme()
  const blocked = access && !access.ready && !access.loading
  const waiting = loading || access?.loading
  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={$frame}>
      <Header title={title} leftTx="common:back" onLeftPress={onBack} />
      {blocked ? (
        <EmptyState
          imageSource={null}
          heading={translate("events:signIn")}
          content={access.message}
          button={access.actionLabel ?? translate("account:signIn")}
          buttonOnPress={access.request}
        />
      ) : waiting ? (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={translate("events:loading")}
          style={themed($content)}
        >
          <Text size="xs" style={themed($dim)} tx="events:loading" />
        </View>
      ) : (
        <>
          <ScrollView
            style={$styles.flex1}
            contentContainerStyle={themed($content)}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <BottomActionBar>{footer}</BottomActionBar> : null}
        </>
      )}
    </Screen>
  )
}

// why: the fixed preset bottom-aligns content, which dropped the header to the bottom while loading or signed out.
const $frame: ViewStyle = { flex: 1, justifyContent: "flex-start" }

export const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.lg,
  padding: spacing.lg,
  paddingBottom: spacing.xl,
})
export const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
export const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
export const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 48,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.separator,
})
export const $grow: ViewStyle = { flex: 1 }
export const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
export const $action: ViewStyle = { flex: 1, minHeight: 48 }
