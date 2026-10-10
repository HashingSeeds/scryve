import type { ConfigContext, ExpoConfig } from "expo/config"
import {
  AndroidConfig,
  CodeGenerator,
  withAndroidManifest,
  withMainActivity,
} from "expo/config-plugins"

const IS_DEV = process.env.APP_VARIANT === "development"
const IS_PREVIEW = process.env.APP_VARIANT === "preview"

/**
 * why: safe only because fingerprint.config.js skips ExpoConfigExtraSection; otherwise notes change
 * the runtime. RELEASE_NOTES is `release-train.cjs notes` output. The commit lets a later update's
 * notes skip what this build already has; EAS sets it for binaries, GitHub Actions for beta updates.
 */
const RELEASE_NOTES: { notes: string[]; newSince: Record<string, number> } | null = process.env
  .RELEASE_NOTES
  ? JSON.parse(process.env.RELEASE_NOTES)
  : null
const RELEASE_COMMIT = process.env.EAS_BUILD_GIT_COMMIT_HASH ?? process.env.GITHUB_SHA

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
    return "Scryve (Dev)"
  }
  if (IS_PREVIEW) {
    return "Scryve (Preview)"
  }
  return "Scryve"
}

const getUniqueIdentifier = () => {
  if (IS_DEV) {
    return "com.sowinghope.count.dev"
  }
  if (IS_PREVIEW) {
    return "com.sowinghope.count.preview"
  }
  return "com.sowinghope.count"
}

const getAppScheme = () => {
  if (IS_DEV) {
    return "scryve-dev"
  }
  if (IS_PREVIEW) {
    return "scryve-preview"
  }
  return "scryve"
}

const getLegacyAppScheme = () => {
  if (IS_DEV) {
    return "count-dev"
  }
  if (IS_PREVIEW) {
    return "count-preview"
  }
  return "count"
}

export default ({ config }: ConfigContext): Partial<ExpoConfig> => {
  const existingPlugins = config.plugins ?? []

  const requiredPlugins = ["@clerk/expo", "expo-secure-store", "expo-image"]
  const plugins = [...existingPlugins]
  for (const plugin of requiredPlugins) {
    if (!plugins.some((entry) => (Array.isArray(entry) ? entry[0] : entry) === plugin)) {
      plugins.push(plugin)
    }
  }
  plugins.push([
    "expo-image-picker",
    {
      photosPermission: "Allow Scryve to attach a screenshot you choose to a support request.",
      cameraPermission: false,
      microphonePermission: false,
    },
  ])

  const normalizedInviteOrigin = normalizeHttpsOrigin(process.env.EXPO_PUBLIC_INVITE_ORIGIN)
  const inviteUrl = normalizedInviteOrigin ? new URL(normalizedInviteOrigin) : undefined

  const webExportBaseUrl = process.env.SCRYVE_WEB_BASE_URL?.trim()

  const expoConfig = {
    ...config,
    experiments: {
      ...config.experiments,
      ...(webExportBaseUrl ? { baseUrl: webExportBaseUrl } : {}),
    },
    name: getAppName(),
    slug: config.slug ?? "count",
    scheme: [getAppScheme(), getLegacyAppScheme()],
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
    extra: {
      ...config.extra,
      // why: Sentry reads this to tag the build; "local" marks builds made without an EAS profile or script.
      appVariant: process.env.APP_VARIANT || "local",
      ...(RELEASE_NOTES
        ? { releaseNotes: RELEASE_NOTES.notes, releaseNotesNewSince: RELEASE_NOTES.newSince }
        : {}),
      ...(RELEASE_COMMIT ? { releaseCommit: RELEASE_COMMIT } : {}),
    },
  }

  // why: React Native re-measures text on a fontScale change, so keep the activity (and JS state) alive.
  const withFontScaleConfigChange = withAndroidManifest(expoConfig, (config) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults)
    const changes = activity.$["android:configChanges"]?.split("|") ?? []
    if (!changes.includes("fontScale"))
      activity.$["android:configChanges"] = [...changes, "fontScale"].join("|")
    return config
  })

  return withMainActivity(withFontScaleConfigChange, (config) => {
    const { modResults } = config
    modResults.contents = CodeGenerator.mergeContents({
      src: modResults.contents,
      tag: "scryve-rotation-animation",
      anchor: /super\.onCreate\(null\)/,
      offset: 1,
      comment: "    //",
      newSrc:
        "    window.attributes = window.attributes.apply { rotationAnimation = android.view.WindowManager.LayoutParams.ROTATION_ANIMATION_JUMPCUT }",
    }).contents
    return config
  })
}
