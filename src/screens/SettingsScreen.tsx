import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { ListItem } from "@/components/ListItem"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Switch } from "@/components/Toggle/Switch"
import { STARTING_LIFE_PRESETS } from "@/features/game/domain"
import type { LocalSettings, ThemePreference } from "@/features/game/localPersistence"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface SettingsScreenProps {
  initialSettings: LocalSettings
  onBack: () => void
  onSave: (settings: LocalSettings) => void
  onRequestAccountDeletion?: () => void
  onOpenPrivacy?: () => void
  onOpenTerms?: () => void
  onOpenEula?: () => void
  onOpenCookiePolicy?: () => void
}

export function SettingsScreen({
  initialSettings,
  onBack,
  onSave,
  onRequestAccountDeletion,
  onOpenPrivacy,
  onOpenTerms,
  onOpenEula,
  onOpenCookiePolicy,
}: SettingsScreenProps) {
  const { themed } = useAppTheme()
  const [settings, setSettings] = useState(initialSettings)
  const update = (next: Partial<LocalSettings>) =>
    setSettings((current) => ({ ...current, ...next }))
  const themes: ThemePreference[] = ["system", "light", "dark"]
  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header titleTx="localGame:settings" leftTx="common:back" onLeftPress={onBack} />
      <Text text="Local game defaults" preset="subheading" accessibilityRole="header" />
      <Text text="Player count" style={themed($label)} />
      <View style={themed($row)}>
        {[2, 3, 4, 5, 6].map((count) => (
          <Button
            key={count}
            text={String(count)}
            accessibilityLabel={`Default ${count} players`}
            accessibilityState={{ selected: settings.defaultPlayerCount === count }}
            preset={settings.defaultPlayerCount === count ? "reversed" : "default"}
            style={themed($choice)}
            onPress={() => update({ defaultPlayerCount: count })}
          />
        ))}
      </View>
      <Text text="Starting life" style={themed($label)} />
      <View style={themed($row)}>
        {STARTING_LIFE_PRESETS.map((life) => (
          <Button
            key={life}
            text={String(life)}
            accessibilityLabel={`Default ${life} life`}
            accessibilityState={{ selected: settings.defaultStartingLife === life }}
            preset={settings.defaultStartingLife === life ? "reversed" : "default"}
            style={themed($choice)}
            onPress={() => update({ defaultStartingLife: life })}
          />
        ))}
      </View>
      <Switch
        testID="haptics-switch"
        label="Haptic feedback"
        helper="A subtle tap response after life changes. Failures never block play."
        value={settings.hapticsEnabled}
        onValueChange={(value) => update({ hapticsEnabled: value })}
      />
      <Text text="Theme" preset="subheading" accessibilityRole="header" />
      <View style={themed($row)}>
        {themes.map((theme) => (
          <Button
            key={theme}
            text={theme[0].toUpperCase() + theme.slice(1)}
            accessibilityState={{ selected: settings.themePreference === theme }}
            preset={settings.themePreference === theme ? "reversed" : "default"}
            style={themed($choice)}
            onPress={() => update({ themePreference: theme })}
          />
        ))}
      </View>
      <Text
        text="System follows your device appearance. Light and dark stay fixed until changed here."
        size="xs"
        style={themed($muted)}
      />
      {onRequestAccountDeletion ? (
        <View style={themed($accountSection)}>
          <Text text="Account & data" preset="subheading" accessibilityRole="header" />
          <Text
            text="Manage the cloud data tied to your Count account. Local games stay on this device."
            size="xs"
            style={themed($muted)}
          />
          <Button
            testID="request-account-deletion-button"
            text="Request account deletion"
            accessibilityHint="Opens the account deletion request page"
            style={themed($dangerButton)}
            textStyle={themed($dangerText)}
            onPress={onRequestAccountDeletion}
          />
        </View>
      ) : null}
      {onOpenPrivacy && onOpenTerms ? (
        <View style={themed($legalSection)}>
          <Text text="Legal" preset="subheading" accessibilityRole="header" />
          <ListItem text="Privacy Policy" rightIcon="caretRight" onPress={onOpenPrivacy} />
          <ListItem text="Terms of Use" rightIcon="caretRight" topSeparator onPress={onOpenTerms} />
          {onOpenEula ? (
            <ListItem
              text="End User License Agreement"
              rightIcon="caretRight"
              topSeparator
              onPress={onOpenEula}
            />
          ) : null}
          {onOpenCookiePolicy ? (
            <ListItem
              text="Cookie Policy"
              rightIcon="caretRight"
              topSeparator
              onPress={onOpenCookiePolicy}
            />
          ) : null}
        </View>
      ) : null}
      <Button
        testID="save-settings-button"
        tx="localGame:saveSettings"
        preset="reversed"
        onPress={() => onSave(settings)}
      />
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  gap: spacing.md,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
})
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $choice: ThemedStyle<ViewStyle> = () => ({ flexGrow: 1, minWidth: 56, minHeight: 48 })
const $label: ThemedStyle<TextStyle> = () => ({ fontWeight: "600" })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $accountSection: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.sm,
  marginTop: spacing.sm,
  paddingTop: spacing.lg,
  borderTopWidth: 1,
  borderColor: colors.separator,
})
const $legalSection: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  marginTop: spacing.sm,
  paddingTop: spacing.lg,
  borderTopWidth: 1,
  borderColor: colors.separator,
})
const $dangerButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 50,
  borderColor: colors.error,
  backgroundColor: colors.transparent,
})
const $dangerText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
