import { InputAccessoryView, Keyboard, View, ViewStyle } from "react-native"
import { Button, Host } from "@expo/ui/swift-ui"
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  labelStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { KeyboardDismissProps } from "./needsKeyboardDismiss"

// why: a native accessory follows its field into RN modals and SwiftUI sheets, where a root overlay would render underneath.
export function KeyboardDismiss({ nativeID }: KeyboardDismissProps) {
  const { themed, theme } = useAppTheme()
  return (
    <InputAccessoryView nativeID={nativeID} backgroundColor={theme.colors.transparent}>
      <View style={themed($row)}>
        <Host style={$button} colorScheme={theme.isDark ? "dark" : "light"}>
          <Button
            testID="keyboard-dismiss"
            label={translate("common:done")}
            systemImage="keyboard.chevron.compact.down"
            onPress={Keyboard.dismiss}
            modifiers={[
              labelStyle("iconOnly"),
              buttonStyle("glass"),
              buttonBorderShape("circle"),
              controlSize("large"),
              tint(theme.colors.text),
            ]}
          />
        </Host>
      </View>
    </InputAccessoryView>
  )
}

const $button: ViewStyle = { width: 48, height: 48 }

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "flex-end",
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xs,
})
