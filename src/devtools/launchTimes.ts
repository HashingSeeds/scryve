import { Platform } from "react-native"
import { AppMetrics } from "expo-observe"

import { buildEnvironment } from "@/utils/buildEnvironment"

const LAUNCH_METRICS = new Set([
  "coldLaunchTime",
  "warmLaunchTime",
  "timeToFirstRender",
  "timeToInteractive",
])

/** why: verify-perf's launch.mjs reads launch times from the log; store builds stay quiet. */
export function logLaunchTimes() {
  if (Platform.OS === "web" || !["development", "preview"].includes(buildEnvironment())) return
  // why: markInteractive saves its metric in the background.
  setTimeout(() => {
    void AppMetrics.getMainSession()
      .getMetrics()
      .then((metrics) => {
        const times = Object.fromEntries(
          metrics
            .filter(({ name }) => LAUNCH_METRICS.has(name))
            .map(({ name, value }) => [name, value]),
        )
        console.info(`scryve-launch ${JSON.stringify(times)}`)
      })
  }, 1000)
}
