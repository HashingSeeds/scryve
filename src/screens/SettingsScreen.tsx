import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Platform, ScrollView, View } from "react-native"
import * as Application from "expo-application"

import { ChoiceButton } from "@/components/ChoiceButton"
import { DialogCard } from "@/components/DialogCard"
import { ListItem } from "@/components/ListItem"
import { Text } from "@/components/Text"
import { Switch } from "@/components/Toggle/Switch"
import { ValueField } from "@/components/ValueField"
import { MAX_PLAYERS, MIN_PLAYERS } from "@/features/game/domain"
import { GameTypeList } from "@/features/game/GameTypeList"
import { gameTypeDetail, gameTypeId, newGameTypes, type GameType } from "@/features/game/gameTypes"
import type { LocalSettings, ThemePreference } from "@/features/game/localPersistence"
import {
  counterLabel,
  defaultStartingLife,
  playFormatLabel,
  playSystemRules,
  playSystemShortLabel,
} from "@/features/game/playSystems"
import type { PushKind } from "@/features/notifications/prefs"
import { copyDebugInfo, readAppInfo } from "@/features/updates/appInfo"
import { AppUpdateStatus } from "@/features/updates/AppUpdateStatus"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { analyticsEnabled, analyticsConfigured, setAnalyticsEnabled } from "@/utils/analytics"

import { SettingsPage, SettingsRow } from "./SettingsPage"
import { startingValueRange } from "../../convex/lib/systems"

const LAUNCH_DESTINATIONS = ["play", "decks"] as const
const THEMES: ThemePreference[] = ["system", "light", "dark"]

type CopyStatus = "idle" | "copied" | "failed"

function defaultGameLabel({ defaultSystem, defaultFormat }: LocalSettings) {
  if (!defaultSystem) return translate("systems:noSystem")
  const system = playSystemShortLabel(defaultSystem)
  return defaultFormat ? `${playFormatLabel(defaultSystem, defaultFormat)} · ${system}` : system
}

function versionSummary() {
  const { version, build } = readAppInfo()
  return Application.nativeBuildVersion ? `${version} (${build})` : version
}

export interface SettingsScreenProps {
  initialSettings: LocalSettings
  onBack: () => void
  onSettingsChange: (settings: LocalSettings) => void
  onOpenAbout: () => void
  onOpenAppIcon?: () => void
  onOpenBlockedPlayers?: () => void
  notifications?: {
    feedbackReplies: boolean
    renewalReminders?: boolean
    onChange: (kind: PushKind, on: boolean) => void
  }
}

export function SettingsScreen({
  initialSettings,
  onBack,
  onSettingsChange,
  onOpenAbout,
  onOpenAppIcon,
  onOpenBlockedPlayers,
  notifications,
}: SettingsScreenProps) {
  const { themed } = useAppTheme()
  const [settings, setSettings] = useState(initialSettings)
  const [choosingGame, setChoosingGame] = useState(false)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle")
  const [sharing, setSharing] = useState(analyticsEnabled)
  const [analyticsError, setAnalyticsError] = useState("")
  const update = (changes: Partial<LocalSettings>) => {
    const next = { ...settings, ...changes }
    setSettings(next)
    onSettingsChange(next)
  }
  const selectGameType = ({ system, format }: GameType) => {
    setChoosingGame(false)
    const { defaultSystem: _system, defaultFormat: _format, ...rest } = settings
    const next: LocalSettings = {
      ...rest,
      ...(system ? { defaultSystem: system } : {}),
      ...(format ? { defaultFormat: format } : {}),
      ...(system === settings.defaultSystem
        ? followDefaultLife({ defaultFormat: format })
        : {
            defaultStartingLife: defaultStartingLife(system, format, settings.defaultPlayerCount),
          }),
    }
    setSettings(next)
    onSettingsChange(next)
  }
  const followDefaultLife = (
    changes: Partial<Pick<LocalSettings, "defaultFormat" | "defaultPlayerCount">>,
  ) => {
    const { defaultSystem, defaultFormat, defaultPlayerCount } = { ...settings, ...changes }
    const previous = defaultStartingLife(
      settings.defaultSystem,
      settings.defaultFormat,
      settings.defaultPlayerCount,
    )
    return settings.defaultStartingLife === previous
      ? {
          defaultStartingLife: defaultStartingLife(
            defaultSystem,
            defaultFormat,
            defaultPlayerCount,
          ),
        }
      : {}
  }
  const gameTypes = newGameTypes({
    chosen: { system: settings.defaultSystem, format: settings.defaultFormat },
    connected: false,
  })
  const selectedGameTypeId = settings.defaultSystem
    ? settings.defaultFormat && gameTypeId(settings.defaultSystem, settings.defaultFormat)
    : gameTypeId(undefined)
  const counter = playSystemRules(settings.defaultSystem).counter
  return (
    <SettingsPage titleTx="account:settings.title" onBack={onBack} scrollTestID="settings-scroll">
      <Text tx="account:settings.localDefaults" preset="subheading" accessibilityRole="header" />
      <SettingsRow
        testID="default-game"
        tx="account:settings.game"
        value={defaultGameLabel(settings)}
        topSeparator
        onPress={() => setChoosingGame(true)}
      />
      <View style={themed($valueGrid)}>
        <View style={themed($playerValue)}>
          <ValueField
            testID="default-player-count"
            label={translate("account:settings.players")}
            value={settings.defaultPlayerCount}
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            onChange={(defaultPlayerCount) =>
              update({ defaultPlayerCount, ...followDefaultLife({ defaultPlayerCount }) })
            }
          />
        </View>
        <View style={themed($counterValue)}>
          <ValueField
            testID="default-starting-life"
            label={counterLabel(settings.defaultSystem)}
            value={settings.defaultStartingLife}
            min={startingValueRange(settings.defaultSystem).min}
            max={counter.maxStartingValue}
            step={counter.tapStep}
            longStep={counter.longPressStep ?? 10}
            onChange={(defaultStartingLife) => update({ defaultStartingLife })}
          />
        </View>
      </View>
      <Text tx="account:settings.general" preset="subheading" accessibilityRole="header" />
      <Text tx="account:settings.openScryveTo" style={themed($label)} />
      <View style={themed($row)}>
        {LAUNCH_DESTINATIONS.map((destination) => (
          <ChoiceButton
            key={destination}
            compact
            testID={`launch-destination-${destination}`}
            tx={`account:settings.launchDestination.${destination}`}
            selected={settings.launchDestination === destination}
            style={themed($choice)}
            onPress={() => update({ launchDestination: destination })}
          />
        ))}
      </View>
      {Platform.OS === "web" ? null : (
        <Switch
          testID="haptics-switch"
          labelTx="account:settings.haptics.label"
          value={settings.hapticsEnabled}
          onValueChange={(value) => update({ hapticsEnabled: value })}
        />
      )}
      <Text tx="account:settings.appearance" preset="subheading" accessibilityRole="header" />
      <Text tx="account:settings.theme.heading" style={themed($label)} />
      <View style={themed($row)}>
        {THEMES.map((theme) => (
          <ChoiceButton
            key={theme}
            compact
            tx={`account:settings.theme.${theme}`}
            selected={settings.themePreference === theme}
            style={themed($choice)}
            onPress={() => update({ themePreference: theme })}
          />
        ))}
      </View>
      {onOpenAppIcon ? (
        <SettingsRow
          testID="settings-app-icon"
          tx="account:settings.appIcon.heading"
          topSeparator
          onPress={onOpenAppIcon}
        />
      ) : null}
      {notifications ? (
        <>
          <Text
            tx="account:settings.notifications.heading"
            preset="subheading"
            accessibilityRole="header"
          />
          <Switch
            testID="notify-feedback-switch"
            labelTx="account:settings.notifications.feedbackReplies"
            helperTx="account:settings.notifications.feedbackRepliesHelper"
            value={notifications.feedbackReplies}
            onValueChange={(on) => notifications.onChange("feedbackReplies", on)}
          />
          {notifications.renewalReminders !== undefined ? (
            <Switch
              testID="notify-renewal-switch"
              labelTx="account:settings.notifications.renewalReminders"
              helperTx="account:settings.notifications.renewalRemindersHelper"
              value={notifications.renewalReminders}
              onValueChange={(on) => notifications.onChange("renewalReminders", on)}
            />
          ) : null}
        </>
      ) : null}
      <Text tx="account:settings.privacy.heading" preset="subheading" accessibilityRole="header" />
      <Switch
        testID="analytics-switch"
        disabled={!analyticsConfigured() && !sharing}
        labelTx="account:shareUsage"
        helperTx="account:settings.privacy.shareUsageHelper"
        value={sharing}
        onValueChange={(value) => {
          const saved = setAnalyticsEnabled(value)
          setSharing(analyticsEnabled())
          setAnalyticsError(saved ? "" : translate("account:settings.privacy.saveFailed"))
        }}
      />
      {!analyticsConfigured() ? <Text size="xs" tx="account:settings.privacy.unavailable" /> : null}
      {analyticsError ? <Text accessibilityRole="alert" size="xs" text={analyticsError} /> : null}
      {onOpenBlockedPlayers ? (
        <SettingsRow
          testID="settings-blocked-players"
          tx="connected:blockedPlayers.title"
          topSeparator
          onPress={onOpenBlockedPlayers}
        />
      ) : null}
      <Text tx="account:settings.about" preset="subheading" accessibilityRole="header" />
      <AppUpdateStatus />
      <View>
        <SettingsRow
          testID="settings-about"
          tx="account:settings.version"
          value={versionSummary()}
          topSeparator
          onPress={onOpenAbout}
        />
        <ListItem
          testID="copy-debug-info-button"
          tx={
            copyStatus === "copied" ? "account:settings.copied" : "account:settings.copyDebugInfo"
          }
          bottomSeparator
          onPress={async () => setCopyStatus((await copyDebugInfo()) ? "copied" : "failed")}
        />
        {copyStatus === "failed" ? (
          <Text tx="account:settings.copyFailed" size="sm" accessibilityLiveRegion="polite" />
        ) : null}
      </View>
      <Switch
        testID="sync-stats-switch"
        labelTx="account:settings.syncStats.label"
        helperTx="account:settings.syncStats.helper"
        value={settings.syncStats ?? false}
        onValueChange={(value) => update({ syncStats: value })}
      />
      <DialogCard
        visible={choosingGame}
        onClose={() => setChoosingGame(false)}
        placement="bottom"
        wide
        backdropTestID="default-game-backdrop"
        backdropAccessibilityLabel={translate("account:settings.closeGameChoices")}
        dialogTestID="default-game-dialog"
        accessibilityViewIsModal
      >
        <ScrollView contentContainerStyle={themed($gameChoices)}>
          <Text tx="account:settings.chooseGame" preset="subheading" accessibilityRole="header" />
          <GameTypeList
            types={gameTypes}
            selectedId={selectedGameTypeId}
            detail={(type) => gameTypeDetail(type, settings.defaultPlayerCount)}
            onChoose={selectGameType}
          />
        </ScrollView>
      </DialogCard>
    </SettingsPage>
  )
}

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
const $gameChoices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
