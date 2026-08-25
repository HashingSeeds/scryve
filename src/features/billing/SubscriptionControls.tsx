import { ActivityIndicator, type TextStyle, View, type ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { COUNT_PRO_ENTITLEMENT_ID } from "./config"
import { useRevenueCat } from "./RevenueCatContext"

export function SubscriptionControls() {
  const { themed } = useAppTheme()
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
    <View style={themed($container)}>
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
          disabled={billing.isLoading}
          style={themed($button)}
          textStyle={themed($buttonText)}
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
  minHeight: 64,
  borderTopWidth: 1,
  borderColor: colors.separator,
})
const $headingText: ViewStyle = { flex: 1 }
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $button: ThemedStyle<ViewStyle> = () => ({
  minWidth: 112,
  minHeight: 44,
  borderWidth: 0,
  backgroundColor: "transparent",
})
const $buttonText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $loading: ViewStyle = { minWidth: 20 }
