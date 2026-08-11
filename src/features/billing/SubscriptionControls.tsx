import { ActivityIndicator, type TextStyle, View, type ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { COUNT_PRO_ENTITLEMENT_ID } from "./config"
import { useRevenueCat } from "./RevenueCatContext"

function subscriptionSummary() {
  return "Unlimited decks, complete connected history, and deck analytics across your signed-in devices."
}

export function SubscriptionControls() {
  const { themed } = useAppTheme()
  const billing = useRevenueCat()
  const entitlement = billing.customerInfo?.entitlements.all[COUNT_PRO_ENTITLEMENT_ID]
  const expiration = entitlement?.expirationDate
    ? new Date(entitlement.expirationDate).toLocaleDateString()
    : null

  return (
    <View style={themed($container)}>
      <View style={themed($headingRow)}>
        <View style={$headingText}>
          <Text preset="subheading" text="Count Pro" accessibilityRole="header" />
          <Text
            size="xs"
            style={themed($muted)}
            text={billing.isCountPro ? "Active" : subscriptionSummary()}
          />
        </View>
        {billing.isLoading ? <ActivityIndicator accessibilityLabel="Loading Count Pro" /> : null}
      </View>

      {billing.isCountPro && entitlement ? (
        <Text
          size="xs"
          text={
            expiration
              ? `${entitlement.willRenew ? "Renews" : "Available until"} ${expiration}`
              : "Lifetime access"
          }
        />
      ) : null}

      {!billing.configured ? (
        <Text
          accessibilityRole="alert"
          size="xs"
          text={billing.configurationMessage || "Count Pro purchases are not configured."}
        />
      ) : null}
      {billing.error ? <Text accessibilityRole="alert" size="xs" text={billing.error} /> : null}

      {billing.configured ? (
        <View style={themed($actions)}>
          {!billing.isCountPro ? (
            <Button
              testID="count-pro-paywall-button"
              text="View Count Pro options"
              preset="reversed"
              disabled={billing.isLoading}
              style={themed($button)}
              onPress={() => void billing.presentPaywall()}
            />
          ) : (
            <Button
              testID="count-pro-customer-center-button"
              text="Manage Count Pro"
              disabled={billing.isLoading}
              style={themed($button)}
              onPress={() => void billing.presentCustomerCenter()}
            />
          )}
          <Button
            testID="restore-purchases-button"
            text="Restore purchases"
            disabled={billing.isLoading}
            style={themed($button)}
            onPress={() => void billing.restorePurchases()}
          />
        </View>
      ) : null}
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.sm,
  marginHorizontal: spacing.lg,
  marginBottom: spacing.sm,
  padding: spacing.md,
  borderWidth: 1,
  borderColor: colors.separator,
  borderRadius: spacing.sm,
  backgroundColor: colors.palette.neutral100,
})
const $headingRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
})
const $headingText: ViewStyle = { flex: 1 }
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $button: ThemedStyle<ViewStyle> = () => ({ flexGrow: 1, minWidth: 160, minHeight: 48 })
