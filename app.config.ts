import type { ConfigContext, ExpoConfig } from "expo/config"

/**
 * Use tsx/cjs here so we can use TypeScript for our Config Plugins
 * and not have to compile them to JavaScript.
 *
 * See https://docs.expo.dev/config-plugins/plugins/#add-typescript-support-and-convert-to-dynamic-app-config
 */
import "tsx/cjs"
import { normalizeHttpsOrigin } from "./app/utils/httpsOrigin"
import { withIosDeploymentTarget } from "./plugins/withIosDeploymentTarget"

const IS_DEV = process.env.APP_VARIANT === "development"
const IS_PREVIEW = process.env.APP_VARIANT === "preview"

const getAppName = () => {
  if (IS_DEV) {
    return "Count (Dev)"
  }
  if (IS_PREVIEW) {
    return "Count (Preview)"
  }
  return "Count"
}

const getUniqueIdentifier = () => {
  if (IS_DEV) {
    return "com.sowinghope.count.dev"
  }
  if (IS_PREVIEW) {
    return "com.sowinghpe.count.preview"
  }
  return "com.sowinghope.count"
}

const getAppScheme = () => {
  if (IS_DEV) {
    return "count-dev"
  }
  if (IS_PREVIEW) {
    return "count-preview"
  }
  return "count"
}

/**
 * @param config ExpoConfig coming from the static config app.json if it exists
 *
 * You can read more about Expo's Configuration Resolution Rules here:
 * https://docs.expo.dev/workflow/configuration/#configuration-resolution-rules
 */
export default ({ config }: ConfigContext): Partial<ExpoConfig> => {
  const existingPlugins = config.plugins ?? []

  const requiredPlugins = ["@clerk/expo", "expo-secure-store"]
  const plugins = [...existingPlugins]
  for (const plugin of requiredPlugins) {
    if (!plugins.some((entry) => (Array.isArray(entry) ? entry[0] : entry) === plugin)) {
      plugins.push(plugin)
    }
  }

  const normalizedInviteOrigin = normalizeHttpsOrigin(process.env.EXPO_PUBLIC_INVITE_ORIGIN)
  const inviteUrl = normalizedInviteOrigin ? new URL(normalizedInviteOrigin) : undefined

  const expoConfig = {
    ...config,
    name: getAppName(),
    scheme: getAppScheme(),
    ios: {
      ...config.ios,
      bundleIdentifier: getUniqueIdentifier(),
      associatedDomains: inviteUrl ? [`applinks:${inviteUrl.host}`] : [],
      // This privacyManifests is to get you started.
      // See Expo's guide on apple privacy manifests here:
      // https://docs.expo.dev/guides/apple-privacy/
      // You may need to add more privacy manifests depending on your app's usage of APIs.
      // More details and a list of "required reason" APIs can be found in the Apple Developer Documentation.
      // https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
            NSPrivacyAccessedAPITypeReasons: ["CA92.1"], // CA92.1 = "Access info from same app, per documentation"
          },
        ],
      },
    },
    android: {
      ...config.android,
      package: getUniqueIdentifier(),
      intentFilters: inviteUrl
        ? [
            {
              action: "VIEW",
              autoVerify: true,
              data: [{ scheme: "https", host: inviteUrl.host, pathPrefix: "/join" }],
              category: ["BROWSABLE", "DEFAULT"],
            },
          ]
        : [],
    },
    plugins,
  }

  // Expo resolves the required name and slug from app.json before evaluating this file.
  return withIosDeploymentTarget(expoConfig as ExpoConfig, { deploymentTarget: "17.0" })
}
