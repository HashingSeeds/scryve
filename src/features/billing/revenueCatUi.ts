import { Linking, Platform } from "react-native"
import type { CustomerInfo, PurchasesOffering } from "react-native-purchases"
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui"

import { COUNT_PRO_ENTITLEMENT_ID } from "./config"

export type CountPaywallResult = "not-presented" | "cancelled" | "purchased" | "restored" | "error"

export async function presentCountProPaywall(
  offering?: PurchasesOffering | null,
): Promise<CountPaywallResult> {
  const result = await RevenueCatUI.presentPaywallIfNeeded({
    requiredEntitlementIdentifier: COUNT_PRO_ENTITLEMENT_ID,
    ...(offering ? { offering } : {}),
    displayCloseButton: true,
  })

  switch (result) {
    case PAYWALL_RESULT.NOT_PRESENTED:
      return "not-presented"
    case PAYWALL_RESULT.CANCELLED:
      return "cancelled"
    case PAYWALL_RESULT.PURCHASED:
      return "purchased"
    case PAYWALL_RESULT.RESTORED:
      return "restored"
    case PAYWALL_RESULT.ERROR:
      return "error"
  }
}

export async function presentCountCustomerCenter(customerInfo: CustomerInfo | null) {
  if (Platform.OS !== "web") {
    await RevenueCatUI.presentCustomerCenter()
    return
  }

  const managementUrl = customerInfo?.managementURL
  if (!managementUrl || !managementUrl.startsWith("https://"))
    throw new Error("No subscription management page is available for this customer yet.")
  await Linking.openURL(managementUrl)
}
