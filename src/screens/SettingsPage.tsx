import type { ReactNode } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { Icon } from "@/components/Icon"
import { ListItem } from "@/components/ListItem"
import { Screen } from "@/components/Screen"
import { Text, type TextProps } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface SettingsPageProps {
  titleTx: NonNullable<TextProps["tx"]>
  onBack: () => void
  children: ReactNode
  scrollTestID?: string
}

export function SettingsPage({ titleTx, onBack, children, scrollTestID }: SettingsPageProps) {
  const { themed } = useAppTheme()
  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      header={{ titleTx, leftTx: "common:back", onLeftPress: onBack }}
      contentContainerStyle={themed($scrollContent)}
      ScrollViewProps={{ testID: scrollTestID }}
    >
      <View style={themed($content)}>
        <Text tx={titleTx} preset="heading" accessibilityRole="header" />
        {children}
      </View>
    </Screen>
  )
}

export interface SettingsRowProps {
  tx: NonNullable<TextProps["tx"]>
  onPress: () => void
  value?: string
  testID?: string
  topSeparator?: boolean
}

export function SettingsRow({ tx, onPress, value, testID, topSeparator }: SettingsRowProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  return (
    <ListItem
      testID={testID}
      tx={tx}
      accessibilityLabel={value ? `${translate(tx)}, ${value}` : undefined}
      topSeparator={topSeparator}
      bottomSeparator
      RightComponent={
        <View style={themed($value)}>
          {value ? <Text text={value} numberOfLines={1} tone="dim" /> : null}
          <Icon icon="caretRight" size={20} color={colors.textDim} />
        </View>
      }
      onPress={onPress}
    />
  )
}

const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.md,
})
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  gap: spacing.md,
})
const $value: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexShrink: 1,
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "center",
  gap: spacing.xxs,
  marginStart: spacing.md,
})
