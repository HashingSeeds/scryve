import { Platform } from "react-native"
import * as Application from "expo-application"
import * as Clipboard from "expo-clipboard"
import Constants from "expo-constants"
import * as Updates from "expo-updates"

import { updateChannelLabel } from "@/features/updates/appUpdate"
import { translate } from "@/i18n/translate"
import { analyticsId } from "@/utils/analytics"

const DEBUG_INFO_TITLE = "Scryve"

export const APP_INFO_FIELDS = [
  "version",
  "build",
  "runtime",
  "update",
  "channel",
  "platform",
] as const

export type AppInfoField = (typeof APP_INFO_FIELDS)[number]

export function appInfoLine(field: AppInfoField, value: string) {
  return translate(`account:settings.appInfo.${field}`, { value })
}

export function readAppInfo(): Record<AppInfoField, string> {
  const missing = translate("account:settings.appInfo.unavailable")
  const unavailable =
    Platform.OS === "web" ? translate("account:settings.appInfo.notApplicable") : missing
  const bundled = translate("account:settings.appInfo.bundled")
  return {
    version:
      Platform.OS === "web"
        ? (Constants.expoConfig?.version ?? missing)
        : (Application.nativeApplicationVersion ?? missing),
    build: Application.nativeBuildVersion ?? unavailable,
    runtime: Updates.runtimeVersion || unavailable,
    update:
      Platform.OS === "web"
        ? unavailable
        : Updates.isEnabled
          ? Updates.isEmbeddedLaunch
            ? bundled
            : (Updates.updateId ?? missing)
          : __DEV__
            ? translate("account:settings.appInfo.development")
            : bundled,
    channel: updateChannelLabel() || unavailable,
    platform: Platform.OS,
  }
}

export async function copyDebugInfo() {
  try {
    const info = readAppInfo()
    const id = analyticsId()
    return await Clipboard.setStringAsync(
      [
        DEBUG_INFO_TITLE,
        ...APP_INFO_FIELDS.map((field) => appInfoLine(field, info[field])),
        ...(id ? [translate("account:settings.appInfo.analyticsId", { id })] : []),
      ].join("\n"),
    )
  } catch {
    return false
  }
}
