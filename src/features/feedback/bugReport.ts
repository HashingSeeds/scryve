import { Platform } from "react-native"
import * as Application from "expo-application"
import Constants from "expo-constants"
import * as ImagePicker from "expo-image-picker"
import * as Updates from "expo-updates"
import * as Sentry from "@sentry/react-native"

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024

export type BugScreenshot = {
  uri: string
  filename: string
  contentType: string
  data: Uint8Array
}

export const appVersion = () =>
  Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? undefined

export async function pickScreenshot(): Promise<BugScreenshot | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 })
  if (result.canceled || !result.assets[0]) return null
  const asset = result.assets[0]
  if (asset.fileSize && asset.fileSize > MAX_SCREENSHOT_BYTES)
    throw new Error("Screenshot too large")
  const data =
    Platform.OS === "web"
      ? new Uint8Array(await (await fetch(asset.uri)).arrayBuffer())
      : await Sentry.getDataFromUri(asset.uri)
  if (!data || data.length > MAX_SCREENSHOT_BYTES) throw new Error("Screenshot unavailable")
  return {
    uri: asset.uri,
    filename: asset.fileName ?? "screenshot.jpg",
    contentType: asset.mimeType ?? "image/jpeg",
    data,
  }
}

export function captureBugReport({
  kind,
  body,
  screenshot,
}: {
  kind: "feature" | "bug"
  body: string
  screenshot?: BugScreenshot
}) {
  if (!Sentry.getClient()) return undefined
  return Sentry.captureFeedback(
    {
      message: body,
      tags: {
        kind,
        platform: Platform.OS,
        appVersion: appVersion() ?? "unknown",
        build: Application.nativeBuildVersion ?? "unknown",
        runtime: Updates.runtimeVersion ?? "unknown",
      },
    },
    {
      includeReplay: false,
      ...(screenshot
        ? {
            attachments: [
              {
                filename: screenshot.filename,
                contentType: screenshot.contentType,
                data: screenshot.data,
              },
            ],
          }
        : {}),
    },
  )
}
