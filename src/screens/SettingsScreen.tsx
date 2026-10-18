import { useState, type ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Platform, ScrollView, View } from "react-native"
import * as Application from "expo-application"
import * as Clipboard from "expo-clipboard"
import Constants from "expo-constants"
import * as Updates from "expo-updates"

import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { DialogCard } from "@/components/DialogCard"
import { MENU_BUTTON_STYLE_LABELS, MENU_BUTTON_STYLES } from "@/components/GameMenuButtonShape"
import { Icon } from "@/components/Icon"
import { ListItem } from "@/components/ListItem"
import { Screen } from "@/components/Screen"
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
import {
  backToPreview,
  betaUpdatesChosen,
  canOpenPrPreview,
  isStoreBuild,
  isPrChannel,
  setBetaUpdates,
  updateChannelLabel,
} from "@/features/updates/appUpdate"
import { AppUpdateStatus } from "@/features/updates/AppUpdateStatus"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import {
  analyticsEnabled,
  analyticsConfigured,
  analyticsId,
  setAnalyticsEnabled,
} from "@/utils/analytics"

import { startingValueRange } from "../../convex/lib/systems"

const BETA_UNLOCK_TAPS = 5
const DEBUG_INFO_TITLE = "Scryve"
const LAUNCH_DESTINATIONS = ["play", "decks"] as const

const APP_INFO_FIELDS = ["version", "build", "runtime", "update", "channel", "platform"] as const

type AppInfoField = (typeof APP_INFO_FIELDS)[number]
type CopyStatus = "idle" | "copied" | "failed"

function appInfoLine(field: AppInfoField, value: string) {
  return translate(`account:settings.appInfo.${field}`, { value })
}

function defaultGameLabel({ defaultSystem, defaultFormat }: LocalSettings) {
  if (!defaultSystem) return translate("systems:noSystem")
  const system = playSystemShortLabel(defaultSystem)
  return defaultFormat ? `${playFormatLabel(defaultSystem, defaultFormat)} · ${system}` : system
}

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
  AppIcon?: ReactNode
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
  AppIcon,
}: SettingsScreenProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const [settings, setSettings] = useState(initialSettings)
  const [choosingGame, setChoosingGame] = useState(false)
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle")
  const [sharing, setSharing] = useState(analyticsEnabled)
  const [analyticsError, setAnalyticsError] = useState("")
  const [beta, setBeta] = useState(betaUpdatesChosen)
  const [versionTaps, setVersionTaps] = useState(0)
  const [previewError, setPreviewError] = useState("")
  const missing = translate("account:settings.appInfo.unavailable")
  const unavailable =
    Platform.OS === "web" ? translate("account:settings.appInfo.notApplicable") : missing
  const bundled = translate("account:settings.appInfo.bundled")
  const appInfo: Record<AppInfoField, string> = {
    version:
      Platform.OS === "web"
        ? (Constants.expoConfig?.version ?? missing)
        : (Application.nativeApplicationVersion ?? missing),
    build: Application.nativeBuildVersion ?? unavailable,
    runtime: Updates.runtimeVersion || unavailable,
    update:
      Platform.OS === "web"
        ? unavailable
        : Updates.isEnabled
          ? Updates.isEmbeddedLaunch
            ? bundled
            : (Updates.updateId ?? missing)
          : __DEV__
            ? translate("account:settings.appInfo.development")
            : bundled,
    channel: updateChannelLabel() || unavailable,
    platform: Platform.OS,
  }
  const appInfoEntries = APP_INFO_FIELDS.map((field) => [field, appInfo[field]] as const)
  const currentAnalyticsId = analyticsId()
  const copy = {
    players: translate("account:settings.players"),
    game: translate("account:settings.game"),
    requestDeletionHint: translate("account:settings.accountData.requestDeletionHint"),
    licenseAgreementHint: translate("account:legal.licenseAgreementHint"),
    analyticsId: translate("account:settings.appInfo.analyticsId", { id: currentAnalyticsId }),
  }
  const copyDebugInfo = async () => {
    try {
      const id = analyticsId()
      const copied = await Clipboard.setStringAsync(
        [
          DEBUG_INFO_TITLE,
          ...appInfoEntries.map(([field, value]) => appInfoLine(field, value)),
          ...(id ? [translate("account:settings.appInfo.analyticsId", { id })] : []),
        ].join("\n"),
      )
      setCopyStatus(copied ? "copied" : "failed")
    } catch {
      setCopyStatus("failed")
    }
  }
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
  const themes: ThemePreference[] = ["system", "light", "dark"]
  const gameLabel = defaultGameLabel(settings)
  const gameTypes = newGameTypes({
    chosen: { system: settings.defaultSystem, format: settings.defaultFormat },
    connected: false,
  })
  const selectedGameTypeId = settings.defaultSystem
    ? settings.defaultFormat && gameTypeId(settings.defaultSystem, settings.defaultFormat)
    : gameTypeId(undefined)
  const counter = playSystemRules(settings.defaultSystem).counter
  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      header={{ titleTx: "account:settings.title", leftTx: "common:back", onLeftPress: onBack }}
      contentContainerStyle={themed($scrollContent)}
      ScrollViewProps={{ testID: "settings-scroll" }}
    >
      <View style={themed($content)}>
        <Text tx="account:settings.title" preset="heading" accessibilityRole="header" />
        <Text tx="account:settings.localDefaults" preset="subheading" accessibilityRole="header" />
        <ListItem
          testID="default-game"
          tx="account:settings.game"
          accessibilityLabel={`${copy.game}, ${gameLabel}`}
          topSeparator
          bottomSeparator
          RightComponent={
            <View style={themed($gameValue)}>
              <Text text={gameLabel} numberOfLines={1} style={themed($muted)} />
              <Icon icon="caretRight" size={20} color={colors.textDim} />
            </View>
          }
          onPress={() => setChoosingGame(true)}
        />
        <View style={themed($valueGrid)}>
          <View style={themed($playerValue)}>
            <ValueField
              testID="default-player-count"
              label={copy.players}
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
        <Text tx="account:settings.defaultsHint" size="xs" style={themed($muted)} />
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
        <Text tx="account:settings.launchDestinationHint" size="xs" style={themed($muted)} />
        <Switch
          testID="haptics-switch"
          labelTx="account:settings.haptics.label"
          helperTx="account:settings.haptics.helper"
          value={settings.hapticsEnabled}
          onValueChange={(value) => update({ hapticsEnabled: value })}
        />
        <Text tx="account:settings.theme.heading" preset="subheading" accessibilityRole="header" />
        <View style={themed($row)}>
          {themes.map((theme) => (
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
        <Text tx="account:settings.theme.hint" size="xs" style={themed($muted)} />
        {AppIcon}
        <Text
          tx="account:settings.menuButton.heading"
          preset="subheading"
          accessibilityRole="header"
        />
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
        <Text tx="account:settings.menuButton.hint" size="xs" style={themed($muted)} />
        <Text
          tx="account:settings.privacy.heading"
          preset="subheading"
          accessibilityRole="header"
        />
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
        {!analyticsConfigured() ? (
          <Text size="xs" tx="account:settings.privacy.unavailable" />
        ) : null}
        {analyticsError ? <Text accessibilityRole="alert" size="xs" text={analyticsError} /> : null}
        {onRequestAccountDeletion ? (
          <View style={themed($accountSection)}>
            <Text tx="account:accountData.label" preset="subheading" accessibilityRole="header" />
            <Text tx="account:settings.accountData.description" size="xs" style={themed($muted)} />
            <Button
              testID="request-account-deletion-button"
              tx="account:settings.accountData.requestDeletion"
              accessibilityHint={copy.requestDeletionHint}
              style={themed($dangerButton)}
              textStyle={themed($dangerText)}
              onPress={onRequestAccountDeletion}
            />
          </View>
        ) : null}
        {BlockedPlayers}
        {onOpenSupport ? (
          <View>
            <Text
              tx="account:settings.help.heading"
              preset="subheading"
              accessibilityRole="header"
            />
            <ListItem
              tx="account:settings.help.support"
              rightIcon="caretRight"
              onPress={onOpenSupport}
            />
          </View>
        ) : null}
        {onOpenPrivacy && onOpenTerms ? (
          <View>
            <Text tx="account:legal.heading" preset="subheading" accessibilityRole="header" />
            <ListItem
              tx="account:legal.privacyPolicy"
              rightIcon="caretRight"
              onPress={onOpenPrivacy}
            />
            <ListItem
              tx="account:legal.termsOfUse"
              rightIcon="caretRight"
              topSeparator
              onPress={onOpenTerms}
            />
            {onOpenLicenseAgreement ? (
              <ListItem
                tx="account:legal.licenseAgreement"
                accessibilityHint={copy.licenseAgreementHint}
                rightIcon="caretRight"
                topSeparator
                onPress={onOpenLicenseAgreement}
              />
            ) : null}
            {onOpenCookiePolicy ? (
              <ListItem
                tx="account:legal.cookiePolicy"
                rightIcon="caretRight"
                topSeparator
                onPress={onOpenCookiePolicy}
              />
            ) : null}
            {onOpenGameContentNotices ? (
              <ListItem
                tx="account:legal.gameContent"
                rightIcon="caretRight"
                topSeparator
                onPress={onOpenGameContentNotices}
              />
            ) : null}
          </View>
        ) : null}
        <View>
          <Text
            tx="account:settings.appInfo.heading"
            preset="subheading"
            accessibilityRole="header"
          />
          <AppUpdateStatus />
          {currentAnalyticsId ? (
            <>
              <Text
                size="sm"
                selectable
                accessibilityLabel={copy.analyticsId}
                text={copy.analyticsId}
              />
              <Text
                size="xs"
                style={themed($muted)}
                tx="account:settings.appInfo.analyticsIdHint"
              />
            </>
          ) : null}
          {appInfoEntries.map(([field, value]) => {
            const shorten = (field === "runtime" || field === "update") && value.length > 16
            return (
              <Text
                key={field}
                size="sm"
                selectable
                accessibilityLabel={appInfoLine(field, value)}
                text={appInfoLine(field, shorten ? `${value.slice(0, 12)}…` : value)}
                onPress={
                  field === "version" && isStoreBuild()
                    ? () => setVersionTaps((taps) => taps + 1)
                    : undefined
                }
              />
            )
          })}
          {isStoreBuild() && (beta || versionTaps >= BETA_UNLOCK_TAPS) ? (
            <Switch
              testID="beta-updates-switch"
              labelTx="account:settings.beta.label"
              helperTx="account:settings.beta.helper"
              value={beta}
              onValueChange={(value) => {
                if (setBetaUpdates(value)) setBeta(value)
              }}
            />
          ) : null}
          {canOpenPrPreview() && isPrChannel(Updates.channel) ? (
            <Button
              testID="back-to-preview-button"
              tx="account:settings.backToPreview"
              onPress={() => {
                setPreviewError("")
                backToPreview().catch(() =>
                  setPreviewError(translate("account:settings.backToPreviewFailed")),
                )
              }}
            />
          ) : null}
          {previewError ? (
            <Text text={previewError} size="sm" accessibilityLiveRegion="polite" />
          ) : null}
          <Button
            testID="copy-debug-info-button"
            preset="primary"
            tx={
              copyStatus === "copied" ? "account:settings.copied" : "account:settings.copyDebugInfo"
            }
            onPress={copyDebugInfo}
            style={themed($copyButton)}
          />
          {copyStatus === "failed" ? (
            <Text tx="account:settings.copyFailed" size="sm" accessibilityLiveRegion="polite" />
          ) : null}
        </View>
      </View>
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
    </Screen>
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
const $gameValue: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexShrink: 1,
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "center",
  gap: spacing.xxs,
  marginStart: spacing.md,
})
const $gameChoices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $accountSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})
const $copyButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.sm,
})
const $dangerButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 50,
  borderColor: colors.error,
  backgroundColor: colors.transparent,
})
const $dangerText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
