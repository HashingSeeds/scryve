import PostHog from "posthog-react-native"

import { loadString, saveString } from "@/utils/storage"

import {
  createErrorReplay,
  diagnosticProperties,
  diagnosticRelease,
  getDiagnosticsId,
} from "./diagnosticsPolicy"

let client: PostHog | undefined

export function initDiagnostics() {
  if (client || !process.env.EXPO_PUBLIC_POSTHOG_KEY || !process.env.EXPO_PUBLIC_POSTHOG_HOST)
    return
  try {
    const id = getDiagnosticsId()
    const startReplay = createErrorReplay(
      () => client?.startSessionRecording(),
      () => client?.stopSessionRecording(),
    )
    client = new PostHog(process.env.EXPO_PUBLIC_POSTHOG_KEY, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
      bootstrap: { distinctId: id, isIdentifiedId: false },
      customStorage: {
        getItem: (key) => loadString(`scryve.diagnostics.${key}`),
        setItem: (key, value) => {
          saveString(`scryve.diagnostics.${key}`, value)
        },
      },
      captureAppLifecycleEvents: false,
      capturePushNotificationOpened: false,
      capturePushNotificationSubscriptions: false,
      enableSessionReplay: false,
      sessionReplayConfig: {
        maskAllTextInputs: true,
        maskAllImages: true,
        maskAllSandboxedViews: true,
        captureLog: false,
        captureNetworkTelemetry: false,
        throttleDelayMs: 1000,
        sampleRate: 1,
      },
      errorTracking: {
        autocapture: {
          uncaughtExceptions: true,
          unhandledRejections: true,
          nativeCrashes: true,
          console: [],
        },
      },
      disableRemoteFeatureFlags: true,
      preloadFeatureFlags: false,
      disableSurveys: true,
      setDefaultPersonProperties: false,
      personProfiles: "never",
      disableGeoip: true,
      flushAt: 20,
      flushInterval: 30_000,
      maxQueueSize: 200,
      before_send: (event) => {
        if (!event || event.event !== "$exception") return null
        startReplay()
        return { ...event, properties: diagnosticProperties(event.properties ?? {}) }
      },
    })
    client.addExceptionStep("app.launch", diagnosticRelease())
    void client.ready().catch(() => undefined)
  } catch {}
}

export function captureDiagnosticError(error: Error, errorType: string) {
  initDiagnostics()
  client?.captureException(error, { errorType })
}

export function addDiagnosticStep(name: string, metadata: Record<string, unknown>) {
  client?.addExceptionStep(name, metadata)
}
