import { Linking, Platform } from "react-native"
import * as Application from "expo-application"
import Constants from "expo-constants"
import * as ImagePicker from "expo-image-picker"
import { router } from "expo-router"
import * as Sentry from "@sentry/react-native"
import Head from "expo-router/head"

import { APPLE_STANDARD_EULA_URL } from "@/content/legalLinks"
import {
  SupportScreen,
  type SupportFeedback,
  type SupportScreenshot,
} from "@/screens/SupportScreen"

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024

async function pickScreenshot(): Promise<SupportScreenshot | null> {
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

function submitFeedback({ kind, message, email, screenshot }: SupportFeedback) {
  if (!Sentry.getClient()) throw new Error("Sentry is unavailable")
  Sentry.captureFeedback(
    {
      message,
      email,
      tags: {
        kind,
        platform: Platform.OS,
        appVersion:
          Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "unknown",
        build: Application.nativeBuildVersion ?? "unknown",
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

export default function SupportRoute() {
  return (
    <>
      {Platform.OS === "web" ? (
        <Head>
          <title>Scryve Help</title>
          <meta
            name="description"
            content="Learn how to get started with Scryve, find answers to common questions, or contact support."
          />
        </Head>
      ) : null}
      <SupportScreen
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        onEmailSupport={() =>
          void Linking.openURL("mailto:support@sowinghope.how?subject=Scryve%20Support")
        }
        onSubmitFeedback={submitFeedback}
        onPickScreenshot={pickScreenshot}
        onOpenPrivacy={() => router.push("/privacy")}
        onOpenTerms={() => router.push("/terms")}
        onOpenLicenseAgreement={
          Platform.OS === "ios" ? () => void Linking.openURL(APPLE_STANDARD_EULA_URL) : undefined
        }
        onOpenCookiePolicy={() => router.push("/cookie-policy")}
        appVersion={Constants.expoConfig?.version}
      />
    </>
  )
}
