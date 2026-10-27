import { useState } from "react"
import type { ImageSourcePropType, ImageStyle, TextStyle, ViewStyle } from "react-native"
import { Image, Platform, StyleSheet, TouchableOpacity, View } from "react-native"
import {
  getAppIconName,
  setAlternateAppIcon,
  supportsAlternateIcons,
} from "expo-alternate-app-icons"

import { Text } from "@/components/Text"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { APP_ICON_VARIANTS, type AppIconName } from "./appIconVariants"

type Preview = { ios: ImageSourcePropType; android: ImageSourcePropType }

// why: 288px previews from scripts/app-icons.ts, because iOS release builds decode the 1024px icons on the main thread and hitch the first open.
const PREVIEWS: Record<AppIconName, Preview> = {
  Two: {
    ios: require("@assets/images/app-icons/previews/two-ios.png"),
    android: require("@assets/images/app-icons/previews/two-android.png"),
  },
  Three: {
    ios: require("@assets/images/app-icons/previews/three-ios.png"),
    android: require("@assets/images/app-icons/previews/three-android.png"),
  },
  Midnight: {
    ios: require("@assets/images/app-icons/previews/midnight-ios.png"),
    android: require("@assets/images/app-icons/previews/midnight-android.png"),
  },
  Graphite: {
    ios: require("@assets/images/app-icons/previews/graphite-ios.png"),
    android: require("@assets/images/app-icons/previews/graphite-android.png"),
  },
  Ink: {
    ios: require("@assets/images/app-icons/previews/ink-ios.png"),
    android: require("@assets/images/app-icons/previews/ink-android.png"),
  },
  Outline: {
    ios: require("@assets/images/app-icons/previews/outline-ios.png"),
    android: require("@assets/images/app-icons/previews/outline-android.png"),
  },
  Bone: {
    ios: require("@assets/images/app-icons/previews/bone-ios.png"),
    android: require("@assets/images/app-icons/previews/bone-android.png"),
  },
  Paper: {
    ios: require("@assets/images/app-icons/previews/paper-ios.png"),
    android: require("@assets/images/app-icons/previews/paper-android.png"),
  },
  Ash: {
    ios: require("@assets/images/app-icons/previews/ash-ios.png"),
    android: require("@assets/images/app-icons/previews/ash-android.png"),
  },
  Pencil: {
    ios: require("@assets/images/app-icons/previews/pencil-ios.png"),
    android: require("@assets/images/app-icons/previews/pencil-android.png"),
  },
  Foil: {
    ios: require("@assets/images/app-icons/previews/foil-ios.png"),
    android: require("@assets/images/app-icons/previews/foil-android.png"),
  },
  Contour: {
    ios: require("@assets/images/app-icons/previews/contour-ios.png"),
    android: require("@assets/images/app-icons/previews/contour-android.png"),
  },
  Stripes: {
    ios: require("@assets/images/app-icons/previews/stripes-ios.png"),
    android: require("@assets/images/app-icons/previews/stripes-android.png"),
  },
  Neon: {
    ios: require("@assets/images/app-icons/previews/neon-ios.png"),
    android: require("@assets/images/app-icons/previews/neon-android.png"),
  },
  Blueprint: {
    ios: require("@assets/images/app-icons/previews/blueprint-ios.png"),
    android: require("@assets/images/app-icons/previews/blueprint-android.png"),
  },
  Gilded: {
    ios: require("@assets/images/app-icons/previews/gilded-ios.png"),
    android: require("@assets/images/app-icons/previews/gilded-android.png"),
  },
  Prism: {
    ios: require("@assets/images/app-icons/previews/prism-ios.png"),
    android: require("@assets/images/app-icons/previews/prism-android.png"),
  },
  Holo: {
    ios: require("@assets/images/app-icons/previews/holo-ios.png"),
    android: require("@assets/images/app-icons/previews/holo-android.png"),
  },
}
// why: scripts/app-icons.ts does not draw the main icon, so these are 288px copies of app-icon-ios.png and app-icon-android-adaptive-foreground.png.
const DEFAULT_PREVIEW: Preview = {
  ios: require("@assets/images/app-icons/previews/default-ios.png"),
  android: require("@assets/images/app-icons/previews/default-android.png"),
}
const ANDROID = Platform.OS === "android"

export function AppIconPicker() {
  const { themed } = useAppTheme()
  const billing = useRevenueCat()
  const auth = useAuthAccess()
  const planLoading = auth.isSignedIn && billing.customerInfo === null
  const planFailed = planLoading && !billing.isLoading && Boolean(billing.error)
  const [current, setCurrent] = useState(() => (supportsAlternateIcons ? getAppIconName() : null))
  const [error, setError] = useState("")
  if (!supportsAlternateIcons) return null

  async function choose(name: AppIconName | null) {
    try {
      setCurrent(await setAlternateAppIcon(name))
      setError("")
    } catch {
      setError(translate("account:settings.appIcon.changeFailed"))
    }
  }

  const variantOption = ({ name, tier, background }: (typeof APP_ICON_VARIANTS)[number]) => ({
    name,
    id: name.toLowerCase(),
    label: translate(`account:settings.appIcon.names.${name}`),
    preview: PREVIEWS[name],
    background,
    locked: tier === "pro" && !billing.isCountPro,
    lapsed: tier === "foil" && !billing.isFoil,
  })
  const options = [
    {
      name: null,
      id: "default",
      label: translate("account:settings.appIcon.names.Default"),
      preview: DEFAULT_PREVIEW,
      background: "#000000",
      locked: false,
      lapsed: false,
    },
    ...APP_ICON_VARIANTS.filter(({ tier }) => tier === "pro").map(variantOption),
  ]
  const foilOptions = APP_ICON_VARIANTS.filter(
    ({ name, tier }) => tier === "foil" && (billing.isFoil || name === current),
  ).map(variantOption)

  const renderOption = ({
    name,
    id,
    label,
    preview,
    background,
    locked,
    lapsed,
  }: (typeof options)[number]) => {
    const selected = name === current
    const disabled = lapsed || (locked && planLoading)
    return (
      <TouchableOpacity
        key={id}
        testID={`app-icon-${id}`}
        accessibilityRole="radio"
        accessibilityLabel={
          locked ? translate("account:settings.appIcon.lockedPro", { name: label }) : label
        }
        accessibilityHint={
          locked
            ? translate(
                auth.isSignedIn
                  ? "account:settings.appIcon.opensPro"
                  : "account:settings.appIcon.opensSignIn",
              )
            : undefined
        }
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        activeOpacity={0.75}
        style={[$option, (locked || lapsed) && $locked]}
        onPress={() => {
          if (!locked) void choose(name)
          else if (auth.isSignedIn) void billing.presentPaywall()
          else auth.openAuth()
        }}
      >
        <View style={[themed($frame), selected && themed($selectedFrame)]}>
          <View style={[$mask, { backgroundColor: background }]}>
            <Image
              source={ANDROID ? preview.android : preview.ios}
              style={ANDROID ? $androidForeground : $preview}
            />
            <View pointerEvents="none" style={themed($edge)} />
          </View>
        </View>
        <Text size="xxs" text={label} style={themed($label)} />
      </TouchableOpacity>
    )
  }

  return (
    <View style={themed($picker)}>
      <View accessibilityRole="radiogroup" style={themed($picker)}>
        <View style={themed($row)}>{options.map(renderOption)}</View>
        {foilOptions.length > 0 ? (
          <>
            <Text tx="account:settings.appIcon.foilHeading" size="xs" weight="medium" />
            <View style={themed($row)}>{foilOptions.map(renderOption)}</View>
          </>
        ) : null}
      </View>
      {planFailed ? <Text size="xs" tx="account:settings.appIcon.proFailed" /> : null}
      {error ? <Text accessibilityRole="alert" size="xs" text={error} /> : null}
    </View>
  )
}

const $picker: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  rowGap: spacing.sm,
})
const $option: ViewStyle = { width: "33.33%", alignItems: "center", gap: 4 }
const $locked: ViewStyle = { opacity: 0.45 }
const $frame: ThemedStyle<ViewStyle> = ({ colors }) => ({
  padding: 3,
  borderRadius: ANDROID ? 34 : 18,
  borderWidth: 2,
  borderColor: colors.transparent,
})
const $selectedFrame: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $preview: ImageStyle = { width: 56, height: 56 }
// why: an adaptive foreground is a 108dp canvas whose launcher mask shows only the middle 72dp, so the image is drawn at 1.5x and centered under a circle.
const $androidForeground: ImageStyle = { width: 84, height: 84, margin: -14 }
const $mask: ViewStyle = {
  width: 56,
  height: 56,
  borderRadius: ANDROID ? 28 : 13,
  overflow: "hidden",
}
// why: an icon whose background matches the page would lose its edge without this outline.
const $edge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFill,
  borderRadius: ANDROID ? 28 : 13,
  borderWidth: 1,
  borderColor: colors.border,
})
const $label: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
