import { ActivityIndicator, type TextStyle, View, type ViewStyle } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { appLocale } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { COUNT_PRO_ENTITLEMENT_ID } from "./config"
import { useRevenueCat } from "./RevenueCatContext"

const PLAN_TITLES = { Foil: "Scryve Foil", Pro: "Scryve Pro" } as const

export function SubscriptionControls() {
  const { themed } = useAppTheme()
  const billing = useRevenueCat()
  const entitlement = billing.customerInfo?.entitlements.all[COUNT_PRO_ENTITLEMENT_ID]
  const planName = billing.isFoil ? "Foil" : "Pro"
  const expiration = entitlement?.expirationDate
    ? new Date(entitlement.expirationDate).toLocaleDateString(appLocale)
    : null
  const accessStatus = billing.isLoading
    ? translate("account:billing.access.checking")
    : billing.isCountPro
      ? expiration
        ? translate(
            entitlement?.willRenew
              ? "account:billing.access.renews"
              : "account:billing.access.availableUntil",
            { date: expiration },
          )
        : translate("account:billing.access.active", { plan: planName })
      : billing.error
        ? translate("account:billing.access.unavailable")
        : translate("account:billing.access.free")
  const copy = {
    loading: translate("account:billing.loading"),
    buttonLabel: billing.isCountPro
      ? translate("account:billing.manageAccessibilityLabel", { plan: planName })
      : translate("account:billing.viewOptionsAccessibilityLabel"),
    notConfigured: billing.configurationMessage || translate("account:billing.notConfigured"),
  }

  return (
    <View style={themed($container)}>
      <View style={$headingText}>
        <Text preset="subheading" text={PLAN_TITLES[planName]} accessibilityRole="header" />
        {billing.configured ? (
          <Text
            size="xs"
            style={themed($muted)}
            text={accessStatus}
            accessibilityLiveRegion="polite"
          />
        ) : null}
      </View>

      {billing.isLoading ? <ActivityIndicator accessibilityLabel={copy.loading} /> : null}

      {billing.configured ? (
        <Button
          testID={
            billing.isCountPro ? "count-pro-customer-center-button" : "count-pro-paywall-button"
          }
          tx={billing.isCountPro ? "account:billing.manage" : "account:billing.viewOptions"}
          accessibilityLabel={copy.buttonLabel}
          disabled={!billing.isReady || billing.isLoading}
          style={themed($button)}
          textStyle={themed($buttonText)}
          onPress={() =>
            void (billing.isCountPro
              ? billing.presentCustomerCenter()
              : billing.presentPaywall({ showsErrorInline: true }))
          }
        />
      ) : null}

      {!billing.configured ? (
        <Text accessibilityRole="alert" size="xs" text={copy.notConfigured} />
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
  justifyContent: "flex-end",
  paddingRight: 0,
  borderWidth: 0,
  backgroundColor: "transparent",
})
const $buttonText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
