import { useState } from "react"
import type { ImageSourcePropType, ImageStyle, TextStyle, ViewStyle } from "react-native"
import { Image, Platform, TouchableOpacity, View } from "react-native"
import {
  getAppIconName,
  setAlternateAppIcon,
  supportsAlternateIcons,
} from "expo-alternate-app-icons"

import { Text } from "@/components/Text"
import { useRevenueCat } from "@/features/billing/RevenueCatContext"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { APP_ICON_VARIANTS, type AppIconName } from "./appIconVariants"

type Preview = { ios: ImageSourcePropType; android: ImageSourcePropType }

const PREVIEWS: Record<AppIconName, Preview> = {
  Two: {
    ios: require("@assets/images/app-icons/two-ios.png"),
    android: require("@assets/images/app-icons/two-android-foreground.png"),
  },
  Three: {
    ios: require("@assets/images/app-icons/three-ios.png"),
    android: require("@assets/images/app-icons/three-android-foreground.png"),
  },
  Midnight: {
    ios: require("@assets/images/app-icons/midnight-ios.png"),
    android: require("@assets/images/app-icons/midnight-android-foreground.png"),
  },
  Graphite: {
    ios: require("@assets/images/app-icons/graphite-ios.png"),
    android: require("@assets/images/app-icons/graphite-android-foreground.png"),
  },
  Ink: {
    ios: require("@assets/images/app-icons/ink-ios.png"),
    android: require("@assets/images/app-icons/ink-android-foreground.png"),
  },
  Outline: {
    ios: require("@assets/images/app-icons/outline-ios.png"),
    android: require("@assets/images/app-icons/outline-android-foreground.png"),
  },
  Bone: {
    ios: require("@assets/images/app-icons/bone-ios.png"),
    android: require("@assets/images/app-icons/bone-android-foreground.png"),
  },
  Foil: {
    ios: require("@assets/images/app-icons/foil-ios.png"),
    android: require("@assets/images/app-icons/foil-android-foreground.png"),
  },
}
const DEFAULT_PREVIEW: Preview = {
  ios: require("@assets/images/app-icon-ios.png"),
  android: require("@assets/images/app-icon-android-adaptive-foreground.png"),
}
const ANDROID = Platform.OS === "android"

export function AppIconPicker() {
  const { themed } = useAppTheme()
  const billing = useRevenueCat()
  const [current, setCurrent] = useState(() => (supportsAlternateIcons ? getAppIconName() : null))
  const [error, setError] = useState("")
  if (!supportsAlternateIcons) return null

  async function choose(name: AppIconName | null) {
    try {
      setCurrent(await setAlternateAppIcon(name))
      setError("")
    } catch {
      setError("Could not change the app icon. Please try again.")
    }
  }

  const options = [
    {
      name: null,
      label: "Default",
      preview: DEFAULT_PREVIEW,
      background: "#000000",
      locked: false,
    },
    ...APP_ICON_VARIANTS.map(({ name, tier, background }) => ({
      name,
      label: name,
      preview: PREVIEWS[name],
      background,
      locked: tier === "foil" ? !billing.isFoil : !billing.isCountPro,
    })),
  ]

  return (
    <View style={themed($picker)}>
      <Text text="App icon" preset="subheading" accessibilityRole="header" />
      <View accessibilityRole="radiogroup" style={themed($row)}>
        {options.map(({ name, label, preview, background, locked }) => {
          const selected = name === current
          return (
            <TouchableOpacity
              key={label}
              testID={`app-icon-${label.toLowerCase()}`}
              accessibilityRole="radio"
              accessibilityLabel={
                locked ? `${label}, Scryve ${name === "Foil" ? "Foil" : "Pro"}` : label
              }
              accessibilityHint={locked ? "Opens Scryve Pro" : undefined}
              accessibilityState={{ selected }}
              activeOpacity={0.75}
              style={[$option, locked && $locked]}
              onPress={() => (locked ? void billing.presentPaywall() : void choose(name))}
            >
              <View style={[themed($frame), selected && themed($selectedFrame)]}>
                {ANDROID ? (
                  <View style={[$androidMask, { backgroundColor: background }]}>
                    <Image source={preview.android} style={$androidForeground} />
                  </View>
                ) : (
                  <Image source={preview.ios} style={$preview} />
                )}
              </View>
              <Text size="xxs" text={label} style={themed($label)} />
            </TouchableOpacity>
          )
        })}
      </View>
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
const $preview: ImageStyle = { width: 56, height: 56, borderRadius: 13 }
// why: an adaptive foreground is a 108dp canvas whose launcher mask shows only the middle 72dp, so the image is drawn at 1.5x and centered under a circle.
const $androidMask: ViewStyle = { width: 56, height: 56, borderRadius: 28, overflow: "hidden" }
const $androidForeground: ImageStyle = { width: 84, height: 84, margin: -14 }
const $label: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
