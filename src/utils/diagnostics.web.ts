import { PostHog } from "posthog-js"

import { createErrorReplay, diagnosticProperties, getDiagnosticsId } from "./diagnosticsPolicy"

let client: PostHog | undefined
let recording = false

export function initDiagnostics() {
  if (
    client ||
    typeof window === "undefined" ||
    !process.env.EXPO_PUBLIC_POSTHOG_KEY ||
    !process.env.EXPO_PUBLIC_POSTHOG_HOST
  )
    return
  try {
    const id = getDiagnosticsId()
    const startReplay = createErrorReplay(
      () => {
        recording = true
        client?.startSessionRecording(true)
      },
      () => {
        client?.stopSessionRecording()
        recording = false
      },
    )
    client = new PostHog()
    client.init(process.env.EXPO_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
      bootstrap: { distinctID: id, isIdentifiedID: false },
      persistence: "localStorage",
      persistence_name: "scryve_diagnostics",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_performance: false,
      disable_surveys: true,
      advanced_disable_feature_flags: true,
      person_profiles: "never",
      disable_session_recording: true,
      enable_recording_console_log: false,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "*",
        blockSelector: "img, svg, canvas, video, iframe",
        recordHeaders: false,
        recordBody: false,
        recordCrossOriginIframes: false,
        maskAttributeFn: (name, value) =>
          /^(class|style|width|height)$/.test(name) ? value : "[removed]",
        maskCapturedNetworkRequestFn: () => null,
      },
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
      before_send: (event) => {
        if (event?.event === "$snapshot") return recording ? event : null
        if (!event || event.event !== "$exception") return null
        startReplay()
        return { ...event, properties: diagnosticProperties(event.properties) }
      },
    })
  } catch {
    client = undefined
  }
}

export function captureDiagnosticError(error: Error, errorType: string) {
  initDiagnostics()
  client?.captureException(error, { errorType })
}

export function addDiagnosticStep(name: string, metadata: Record<string, unknown>) {
  client?.addExceptionStep(name, metadata)
}
