import { useCallback } from "react"
import { Platform } from "react-native"
import { useFocusEffect } from "expo-router"

import { overrideSystemUIBackgroundColor } from "@/theme/context.utils"

/** why: mobile Safari paints the page background above and below the app, so a screen that is not on the theme background needs the page to match it. */
export function usePageBackgroundColor(color: string) {
  useFocusEffect(
    useCallback(
      () => (Platform.OS === "web" ? overrideSystemUIBackgroundColor(color) : undefined),
      [color],
    ),
  )
}
