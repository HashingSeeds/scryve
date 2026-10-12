import type { FontSource } from "expo-font"

import { typography } from "./typography"

const { rubik } = typography.fonts

export const fontsToLoad: Record<string, FontSource> = {
  [rubik.light]: require("../../assets/fonts/Rubik-Light.ttf"),
  [rubik.normal]: require("../../assets/fonts/Rubik-Regular.ttf"),
  [rubik.medium]: require("../../assets/fonts/Rubik-Medium.ttf"),
  [rubik.semiBold]: require("../../assets/fonts/Rubik-SemiBold.ttf"),
  [rubik.bold]: require("../../assets/fonts/Rubik-Bold.ttf"),
}
