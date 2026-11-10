import Constants from "expo-constants"
import * as Updates from "expo-updates"

// why: only EAS builds carry a channel, so local and perf builds don't pose as production, and store installs keep theirs even if an update ships without APP_VARIANT.
export function buildEnvironment() {
  const webBuildEnvironment = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT
  if (webBuildEnvironment) return webBuildEnvironment
  if (__DEV__) return "development"
  const variant: unknown = Constants.expoConfig?.extra?.appVariant
  if (typeof variant === "string" && !["", "production", "local"].includes(variant)) return variant
  return Updates.channel || "local"
}
