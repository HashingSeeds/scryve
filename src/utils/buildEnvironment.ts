import Constants from "expo-constants"
import * as Updates from "expo-updates"

// why: only EAS builds carry a channel, so channel-less local and perf builds stop posing as production, and store installs keep their channel even if an update ships without APP_VARIANT.
export function buildEnvironment() {
  const webBuildEnvironment = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT
  if (webBuildEnvironment) return webBuildEnvironment
  if (__DEV__) return "development"
  const variant: unknown = Constants.expoConfig?.extra?.appVariant
  if (typeof variant === "string" && !["", "production", "local"].includes(variant)) return variant
  return Updates.channel || "local"
}
