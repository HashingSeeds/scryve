import { Platform } from "react-native"
import * as Sentry from "@sentry/react-native"

import { analyticsEnabled } from "./analytics"

const TAP_SAMPLE_RATE = 0.2

export function startTapTiming() {
  if (Platform.OS === "web" || !analyticsEnabled() || Math.random() >= TAP_SAMPLE_RATE) return
  const startedAt = performance.now()
  return () =>
    requestAnimationFrame(() =>
      Sentry.metrics.distribution("life.tap_to_paint", performance.now() - startedAt, {
        unit: "millisecond",
        attributes: { os: Platform.OS },
      }),
    )
}
