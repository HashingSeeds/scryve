import { Platform } from "react-native"
import * as Updates from "expo-updates"
import * as Sentry from "@sentry/react-native"

import { setTelemetryAdapter } from "@/utils/telemetry"

const FALLBACK_SENTRY_DSN =
  "https://fb85fd67adf134394a15190b8a488404@o4507118738669568.ingest.us.sentry.io/4511870328635392"

export function initObservability(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? FALLBACK_SENTRY_DSN

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    enableLogs: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    integrations: [
      ...(Platform.OS === "web"
        ? [
            Sentry.browserReplayIntegration({
              maskAllText: true,
              maskAllInputs: true,
              blockAllMedia: true,
            }),
          ]
        : [
            Sentry.mobileReplayIntegration({
              maskAllText: true,
              maskAllImages: true,
              maskAllVectors: true,
            }),
          ]),
      Sentry.feedbackIntegration(),
    ],
  })

  Sentry.setTags({
    updateId: Updates.updateId ?? "embedded",
    updateChannel: Updates.channel ?? "none",
    runtimeVersion: Updates.runtimeVersion ?? "unknown",
    embeddedLaunch: String(Updates.isEmbeddedLaunch),
  })

  setTelemetryAdapter({
    emit: (event) =>
      Sentry.addBreadcrumb({
        category: "telemetry",
        message: event.name,
        data: event.metadata,
        level: "info",
      }),
  })
}
