import { Platform } from "react-native"
import * as Application from "expo-application"
import Constants from "expo-constants"
import * as ImagePicker from "expo-image-picker"
import * as Updates from "expo-updates"
import * as Sentry from "@sentry/react-native"

export const MAX_SCREENSHOTS = 4
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024
// why: every screenshot rides one Sentry feedback envelope, which crosses the native bridge as base64 and must stay under Sentry's upload limits.
const MAX_TOTAL_BYTES = 20 * 1024 * 1024

export type BugScreenshot = {
  uri: string
  filename: string
  contentType: string
  data: Uint8Array
}

export const appVersion = () =>
  Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? undefined

export async function pickScreenshots(attached: BugScreenshot[]): Promise<BugScreenshot[]> {
  const room = MAX_SCREENSHOTS - attached.length
  if (room <= 0) return attached
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    allowsMultipleSelection: room > 1,
    selectionLimit: room,
    orderedSelection: true,
  })
  if (result.canceled) return attached
  // why: Android's legacy picker ignores the selection limit.
  const picked = await Promise.all(result.assets.slice(0, room).map(readScreenshot))
  const next = [...attached, ...picked]
  if (next.reduce((total, shot) => total + shot.data.length, 0) > MAX_TOTAL_BYTES)
    throw new Error("Screenshots too large")
  return next
}

async function readScreenshot(asset: ImagePicker.ImagePickerAsset): Promise<BugScreenshot> {
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
  screenshots,
}: {
  kind: "feature" | "bug"
  body: string
  screenshots: BugScreenshot[]
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
      attachments: screenshots.map(({ filename, contentType, data }) => ({
        filename,
        contentType,
        data,
      })),
    },
  )
}
