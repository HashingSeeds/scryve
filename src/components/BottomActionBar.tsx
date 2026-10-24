import { createContext, useContext, useLayoutEffect, type ReactNode } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import { Platform, View } from "react-native"
import { useKeyboardState } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

// why: a Screen that also padded its bottom inset would stack its padding under the bar's, leaving a dead band below the actions.
export const BottomInsetClaimContext = createContext<(() => () => void) | undefined>(undefined)

export const BOTTOM_LINK_HEIGHT = 44

export function BottomActionBar({
  children,
  endsWithLink = false,
  style,
}: {
  children: ReactNode
  endsWithLink?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const { bottom } = useSafeAreaInsets()
  const keyboardOpen = useKeyboardState((state) => state.isVisible)
  const claimBottomInset = useContext(BottomInsetClaimContext)
  useLayoutEffect(() => claimBottomInset?.(), [claimBottomInset])

  // why: on iOS a trailing link's tap target can overlap the home indicator inset; Android's inset can be a tappable nav bar.
  const inset = endsWithLink && Platform.OS === "ios" ? bottom - BOTTOM_LINK_HEIGHT / 2 : bottom
  const paddingBottom = keyboardOpen ? spacing.sm : Math.max(inset, spacing.sm)
  return <View style={[themed($bar), style, { paddingBottom }]}>{children}</View>
}

const $bar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  padding: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
  backgroundColor: colors.background,
})
