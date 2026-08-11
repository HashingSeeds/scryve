import type { ConfigContext, ExpoConfig } from "expo/config"

const IS_DEV = process.env.APP_VARIANT === "development"
const IS_PREVIEW = process.env.APP_VARIANT === "preview"

function normalizeHttpsOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null
    const port = url.port ? `:${url.port}` : ""
    return `https://${url.hostname.toLowerCase()}${port}`
  } catch {
    return null
  }
}

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

  const requiredPlugins = ["@clerk/expo", "expo-secure-store", "expo-image"]
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

  return expoConfig
}
