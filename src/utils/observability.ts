import { AppState, Platform } from "react-native"
import Constants from "expo-constants"
import * as Updates from "expo-updates"
import * as Sentry from "@sentry/react-native"

import { syncTimingSink } from "@/utils/analytics"
import { setTelemetryAdapter } from "@/utils/telemetry"
import { combineTelemetryAdapters, createBatchingTelemetryAdapter } from "@/utils/telemetryBatch"

const FALLBACK_SENTRY_DSN =
  "https://fb85fd67adf134394a15190b8a488404@o4507118738669568.ingest.us.sentry.io/4511870328635392"

const TAP_FREQUENCY_EVENT_KEEP_PROBABILITY = 0.05

// why: about 1,600 sessions a month at roughly 20 spans each is ~6,400 spans at this rate, against the plan's 5M monthly span quota.
const NATIVE_TRACES_SAMPLE_RATE = 0.2

export const navigationTracing = Sentry.reactNavigationIntegration()

// why: only EAS builds carry a channel, so channel-less local and perf builds stop posing as production, and store installs keep their channel even if an update ships without APP_VARIANT.
function buildEnvironment() {
  const webBuildEnvironment = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT
  if (webBuildEnvironment) return webBuildEnvironment
  if (__DEV__) return "development"
  const variant: unknown = Constants.expoConfig?.extra?.appVariant
  if (typeof variant === "string" && !["", "production", "local"].includes(variant)) return variant
  return Updates.channel || "local"
}

export function initObservability() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? FALLBACK_SENTRY_DSN

  Sentry.init({
    dsn,
    environment: buildEnvironment(),
    sendDefaultPii: false,
    enableLogs: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: Platform.OS === "ios" ? 0 : 1,
    // why: traces exist for native app start and slow or frozen frames, which web does not report.
    tracesSampleRate: Platform.OS === "web" ? undefined : NATIVE_TRACES_SAMPLE_RATE,
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
      // why: request spans would upload request URLs and add trace headers to third-party calls.
      Sentry.reactNativeTracingIntegration({ traceFetch: false, traceXHR: false }),
      navigationTracing,
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

  const batching = createBatchingTelemetryAdapter({
    sink: syncTimingSink,
    keepProbabilityByEvent: { "mutation.ack": TAP_FREQUENCY_EVENT_KEEP_PROBABILITY },
  })

  AppState.addEventListener("change", (state) => {
    if (state !== "active") void batching.flush()
  })

  setTelemetryAdapter(combineTelemetryAdapters(unbatchedBreadcrumbAdapter, batching))
}
