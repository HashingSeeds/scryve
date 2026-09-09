import { AppState } from "react-native"

import { initDiagnostics, addDiagnosticStep } from "@/utils/diagnostics"
import { setTelemetryAdapter } from "@/utils/telemetry"
import {
  combineTelemetryAdapters,
  createBatchingTelemetryAdapter,
  type BatchingTelemetryAdapter,
  type TelemetrySink,
} from "@/utils/telemetryBatch"

const TAP_FREQUENCY_EVENT_KEEP_PROBABILITY = 0.05

export interface ObservabilityOptions {
  sink?: TelemetrySink
  getAnalyticsId?: () => string | undefined
}

export function initObservability(
  options: ObservabilityOptions = {},
): BatchingTelemetryAdapter | undefined {
  initDiagnostics()

  const unbatchedBreadcrumbAdapter = {
    emit: (event: { name: string; metadata: Record<string, unknown> }) =>
      addDiagnosticStep(event.name, event.metadata),
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
