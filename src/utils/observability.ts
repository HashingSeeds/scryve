import { AppState, Platform } from "react-native"
import Constants from "expo-constants"
import * as Updates from "expo-updates"
import * as Sentry from "@sentry/react-native"

import { setTelemetryAdapter } from "@/utils/telemetry"
import {
  combineTelemetryAdapters,
  createBatchingTelemetryAdapter,
  type BatchingTelemetryAdapter,
  type TelemetrySink,
} from "@/utils/telemetryBatch"

const FALLBACK_SENTRY_DSN =
  "https://fb85fd67adf134394a15190b8a488404@o4507118738669568.ingest.us.sentry.io/4511870328635392"

const TAP_FREQUENCY_EVENT_KEEP_PROBABILITY = 0.05

export interface ObservabilityOptions {
  sink?: TelemetrySink
  getAnalyticsId?: () => string | undefined
}

// why: never default to "production"; local Release and perf builds have no channel and used to pose as store installs.
function buildEnvironment() {
  const webBuildEnvironment = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT
  if (webBuildEnvironment) return webBuildEnvironment
  if (__DEV__) return "development"
  const variant: unknown = Constants.expoConfig?.extra?.appVariant
  if (typeof variant !== "string" || !variant) return "local"
  return variant === "production" ? Updates.channel || "local" : variant
}

export function initObservability(
  options: ObservabilityOptions = {},
): BatchingTelemetryAdapter | undefined {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? FALLBACK_SENTRY_DSN

  Sentry.init({
    dsn,
    environment: buildEnvironment(),
    sendDefaultPii: false,
    enableLogs: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: Platform.OS === "ios" ? 0 : 1,
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

  const unbatchedBreadcrumbAdapter = {
    emit: (event: { name: string; metadata: Record<string, unknown> }) =>
      Sentry.addBreadcrumb({
        category: "telemetry",
        message: event.name,
        data: event.metadata,
        level: "info",
      }),
  }

  if (!options.sink) {
    setTelemetryAdapter(unbatchedBreadcrumbAdapter)
    return undefined
  }

  const batching = createBatchingTelemetryAdapter({
    sink: options.sink,
    getAnalyticsId: options.getAnalyticsId,
    keepProbabilityByEvent: { "mutation.ack": TAP_FREQUENCY_EVENT_KEEP_PROBABILITY },
  })

  AppState.addEventListener("change", (state) => {
    if (state !== "active") void batching.flush()
  })

  setTelemetryAdapter(combineTelemetryAdapters(unbatchedBreadcrumbAdapter, batching))
  return batching
}
