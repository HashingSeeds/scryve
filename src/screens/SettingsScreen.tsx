import { useState, type ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { MENU_BUTTON_STYLE_LABELS, MENU_BUTTON_STYLES } from "@/components/GameMenuButtonShape"
import { ListItem } from "@/components/ListItem"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { Switch } from "@/components/Toggle/Switch"
import { ValueField } from "@/components/ValueField"
import { MAX_PLAYERS, MIN_PLAYERS } from "@/features/game/domain"
import type { LocalSettings, ThemePreference } from "@/features/game/localPersistence"
import {
  isPlaySystemId,
  NO_PLAY_SYSTEM,
  PLAY_SYSTEM_LIST,
  defaultStartingLife,
  playSystemFormats,
  playSystemRules,
  type PlaySystemId,
} from "@/features/game/playSystems"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const MIN_STARTING_LIFE = 1

export interface SettingsScreenProps {
  initialSettings: LocalSettings
  onBack: () => void
  onSettingsChange: (settings: LocalSettings) => void
  onRequestAccountDeletion?: () => void
  onOpenSupport?: () => void
  onOpenPrivacy?: () => void
  onOpenTerms?: () => void
  onOpenLicenseAgreement?: () => void
  onOpenCookiePolicy?: () => void
  onOpenGameContentNotices?: () => void
  BlockedPlayers?: ReactNode
}

export function SettingsScreen({
  initialSettings,
  onBack,
  onSettingsChange,
  onRequestAccountDeletion,
  onOpenSupport,
  onOpenPrivacy,
  onOpenTerms,
  onOpenLicenseAgreement,
  onOpenCookiePolicy,
  onOpenGameContentNotices,
  BlockedPlayers,
}: SettingsScreenProps) {
  const { themed } = useAppTheme()
  const [settings, setSettings] = useState(initialSettings)
  const update = (changes: Partial<LocalSettings>) => {
    const next = { ...settings, ...changes }
    setSettings(next)
    onSettingsChange(next)
  }
  const selectSystem = (system?: PlaySystemId) => {
    const { defaultSystem: _system, defaultFormat: _format, ...rest } = settings
    const next: LocalSettings = {
      ...rest,
      defaultStartingLife: defaultStartingLife(system),
      ...(system
        ? {
            defaultSystem: system,
          }
        : {}),
    }
    setSettings(next)
    onSettingsChange(next)
  }
  const selectFormat = (format?: string) => {
    if (!settings.defaultSystem) return
    const previousDefaultLife = defaultStartingLife(settings.defaultSystem, settings.defaultFormat)
    const { defaultFormat: _format, ...rest } = settings
    const next: LocalSettings = {
      ...rest,
      ...(format ? { defaultFormat: format } : {}),
      ...(settings.defaultStartingLife === previousDefaultLife
        ? { defaultStartingLife: defaultStartingLife(settings.defaultSystem, format) }
        : {}),
    }
    setSettings(next)
    onSettingsChange(next)
  }
  const themes: ThemePreference[] = ["system", "light", "dark"]
  const formats = settings.defaultSystem ? playSystemFormats(settings.defaultSystem) : []
  const counter = playSystemRules(settings.defaultSystem).counter
  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      header={{ title: "Settings", leftTx: "common:back", onLeftPress: onBack }}
      contentContainerStyle={themed($scrollContent)}
      ScrollViewProps={{ testID: "settings-scroll" }}
    >
      <View style={themed($content)}>
        <Text text="Settings" preset="heading" accessibilityRole="header" />
        <Text text="Local game defaults" preset="subheading" accessibilityRole="header" />
        <View style={themed($valueGrid)}>
          <View style={themed($playerValue)}>
            <ValueField
              testID="default-player-count"
              label="players"
              value={settings.defaultPlayerCount}
              min={MIN_PLAYERS}
              max={MAX_PLAYERS}
              onChange={(defaultPlayerCount) => update({ defaultPlayerCount })}
            />
          </View>
          <View style={themed($counterValue)}>
            <ValueField
              testID="default-starting-life"
              label={counter.label}
              value={settings.defaultStartingLife}
              min={MIN_STARTING_LIFE}
              max={counter.maxStartingValue}
              step={counter.tapStep}
              longStep={counter.longPressStep ?? 10}
              onChange={(defaultStartingLife) => update({ defaultStartingLife })}
            />
          </View>
        </View>
        <Text text="Open Scryve to" style={themed($label)} />
        <View style={themed($row)}>
          {(["play", "decks"] as const).map((destination) => (
            <ChoiceButton
              key={destination}
              compact
              testID={`launch-destination-${destination}`}
              text={destination === "play" ? "Play" : "Decks"}
              selected={settings.launchDestination === destination}
              style={themed($choice)}
              onPress={() => update({ launchDestination: destination })}
            />
          ))}
        </View>
        <Text
          text="Play resumes a current game or opens a fresh board."
          size="xs"
          style={themed($muted)}
        />
        <Text text="Game system" style={themed($label)} />
        <SegmentedControl
          testID="default-system"
          accessibilityLabel="Default game system"
          selectedId={settings.defaultSystem ?? NO_PLAY_SYSTEM}
          segments={[
            { id: NO_PLAY_SYSTEM, label: "No system" },
            ...PLAY_SYSTEM_LIST.map(({ id, shortLabel }) => ({ id, label: shortLabel })),
          ]}
          onSelect={(id) => selectSystem(isPlaySystemId(id) ? id : undefined)}
        />
        {formats.length > 0 ? (
          <SelectField
            testID="default-format"
            label="Format"
            placeholder="No default"
            clearLabel="No default"
            value={settings.defaultFormat}
            options={formats.map(({ id, label, blurb }) => ({
              id,
              label,
              ...(blurb ? { detail: blurb } : {}),
            }))}
            onSelect={selectFormat}
          />
        ) : null}
        <Text
          text="Set these only when you want new games to start with the same system and format."
          size="xs"
          style={themed($muted)}
        />
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
            <ChoiceButton
              key={theme}
              compact
              text={theme[0].toUpperCase() + theme.slice(1)}
              selected={settings.themePreference === theme}
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
        <Text text="Game menu button" preset="subheading" accessibilityRole="header" />
        <View style={themed($row)}>
          {MENU_BUTTON_STYLES.map((style) => (
            <ChoiceButton
              key={style}
              compact
              testID={`menu-button-style-${style}`}
              text={MENU_BUTTON_STYLE_LABELS[style]}
              selected={settings.menuButtonStyle === style}
              style={themed($choice)}
              onPress={() => update({ menuButtonStyle: style })}
            />
          ))}
        </View>
        <Text
          text="Changes the shape at the center of the board. Prism tints the button with the colors of everyone at the table."
          size="xs"
          style={themed($muted)}
        />
        {onRequestAccountDeletion ? (
          <View style={themed($accountSection)}>
            <Text text="Account & data" preset="subheading" accessibilityRole="header" />
            <Text
              text="Manage the cloud data tied to your Scryve account. Local games stay on this device."
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
        {BlockedPlayers}
        {onOpenSupport ? (
          <View style={themed($legalSection)}>
            <Text text="Help" preset="subheading" accessibilityRole="header" />
            <ListItem text="Help & support" rightIcon="caretRight" onPress={onOpenSupport} />
          </View>
        ) : null}
        {onOpenPrivacy && onOpenTerms ? (
          <View style={themed($legalSection)}>
            <Text text="Legal" preset="subheading" accessibilityRole="header" />
            <ListItem text="Privacy Policy" rightIcon="caretRight" onPress={onOpenPrivacy} />
            <ListItem
              text="Terms of Use"
              rightIcon="caretRight"
              topSeparator
              onPress={onOpenTerms}
            />
            {onOpenLicenseAgreement ? (
              <ListItem
                text="License Agreement"
                accessibilityHint="Opens Apple's standard license agreement in your browser"
                rightIcon="caretRight"
                topSeparator
                onPress={onOpenLicenseAgreement}
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
            {onOpenGameContentNotices ? (
              <ListItem
                text="Third-party game content"
                rightIcon="caretRight"
                topSeparator
                onPress={onOpenGameContentNotices}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </Screen>
  )
}

const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xxxl,
})
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  gap: spacing.md,
})
const $valueGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $playerValue: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $counterValue: ThemedStyle<ViewStyle> = () => ({ flex: 1.45 })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $choice: ThemedStyle<ViewStyle> = () => ({ flexGrow: 1, minWidth: 56 })
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
