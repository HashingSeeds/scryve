import { ActivityIndicator, type TextStyle, View, type ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { COUNT_PRO_ENTITLEMENT_ID } from "./config"
import { useRevenueCat } from "./RevenueCatContext"

export function SubscriptionControls() {
  const { themed, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const billing = useRevenueCat()
  const entitlement = billing.customerInfo?.entitlements.all[COUNT_PRO_ENTITLEMENT_ID]
  const expiration = entitlement?.expirationDate
    ? new Date(entitlement.expirationDate).toLocaleDateString()
    : null
  const accessStatus = billing.isLoading
    ? "Checking access…"
    : billing.isCountPro
      ? expiration
        ? `${entitlement?.willRenew ? "Renews" : "Available until"} ${expiration}`
        : "Lifetime access"
      : billing.error
        ? "Status unavailable"
        : "Free plan"

  return (
    <View
      style={[themed($container), { paddingBottom: Math.max(insets.bottom, theme.spacing.xs) }]}
    >
      <View style={$headingText}>
        <Text preset="subheading" text="Scryve Pro" accessibilityRole="header" />
        {billing.configured ? (
          <Text
            size="xs"
            style={themed($muted)}
            text={accessStatus}
            accessibilityLiveRegion="polite"
          />
        ) : null}
      </View>

      {billing.configured ? (
        <Button
          testID={
            billing.isCountPro ? "count-pro-customer-center-button" : "count-pro-paywall-button"
          }
          text={billing.isCountPro ? "Manage" : "View options"}
          accessibilityLabel={
            billing.isCountPro ? "Manage Scryve Pro subscription" : "View Scryve Pro options"
          }
          preset="reversed"
          disabled={billing.isLoading}
          style={themed($button)}
          onPress={() =>
            void (billing.isCountPro ? billing.presentCustomerCenter() : billing.presentPaywall())
          }
        />
      ) : null}

      <View style={$loading}>
        {billing.isLoading ? <ActivityIndicator accessibilityLabel="Loading Scryve Pro" /> : null}
      </View>

      {!billing.configured ? (
        <Text
          accessibilityRole="alert"
          size="xs"
          text={billing.configurationMessage || "Scryve Pro purchases are not configured."}
        />
      ) : null}
      {billing.error ? <Text accessibilityRole="alert" size="xs" text={billing.error} /> : null}
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.xs,
  borderTopWidth: 1,
  borderColor: colors.separator,
  backgroundColor: colors.palette.neutral100,
})
const $headingText: ViewStyle = { flex: 1 }
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $button: ThemedStyle<ViewStyle> = () => ({ minWidth: 132, minHeight: 40 })
const $loading: ViewStyle = { minWidth: 20 }
