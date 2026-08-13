import type { PlatformOSType } from "react-native"
import { Platform } from "react-native"

export const COUNT_PRO_ENTITLEMENT_ID = "Count Pro"
export const COUNT_PRO_ENTITLEMENT_NAME = "Count Pro"
export const REVENUECAT_OFFERING_ID = "default"

export const COUNT_PRODUCT_IDS = {
  lifetime: "lifetime",
  yearly: "yearly",
  monthly: "monthly",
} as const

export type CountProductId = (typeof COUNT_PRODUCT_IDS)[keyof typeof COUNT_PRODUCT_IDS]

export const COUNT_PACKAGE_IDS: Record<CountProductId, string> = {
  lifetime: "$rc_lifetime",
  yearly: "$rc_annual",
  monthly: "$rc_monthly",
}

export interface RevenueCatConfig {
  apiKey: string
}

export type RevenueCatConfigResult =
  { configured: true; value: RevenueCatConfig } | { configured: false; message: string }

function validPublicApiKey(value: string | undefined): value is string {
  if (!value || value.includes("replace_me")) return false
  return /^(test|appl|goog|rcb)_[A-Za-z0-9]+$/.test(value)
}

export function validateRevenueCatConfig(
  env: Record<string, string | undefined>,
  platform: PlatformOSType,
): RevenueCatConfigResult {
  const platformKey =
    platform === "ios"
      ? env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : platform === "android"
        ? env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY
        : platform === "web"
          ? env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY
          : undefined
  const apiKey = platformKey?.trim() || env.EXPO_PUBLIC_REVENUECAT_API_KEY?.trim()

  if (!validPublicApiKey(apiKey)) {
    return {
      configured: false,
      message:
        "Count Pro purchases are unavailable because the RevenueCat public API key is not configured.",
    }
  }

  return { configured: true, value: { apiKey } }
}

export function readRevenueCatConfig(): RevenueCatConfigResult {
  return validateRevenueCatConfig(
    {
      EXPO_PUBLIC_REVENUECAT_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY,
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
      EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
      EXPO_PUBLIC_REVENUECAT_WEB_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY,
    },
    Platform.OS,
  )
}
