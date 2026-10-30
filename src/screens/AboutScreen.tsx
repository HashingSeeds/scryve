import { useState } from "react"
import { View } from "react-native"
import * as Updates from "expo-updates"

import { Button } from "@/components/Button"
import { ListItem } from "@/components/ListItem"
import { Text } from "@/components/Text"
import { Switch } from "@/components/Toggle/Switch"
import { APP_INFO_FIELDS, appInfoLine, readAppInfo } from "@/features/updates/appInfo"
import {
  backToPreview,
  betaUpdatesChosen,
  canOpenPrPreview,
  isPrChannel,
  isStoreBuild,
  setBetaUpdates,
} from "@/features/updates/appUpdate"
import { translate } from "@/i18n/translate"
import { analyticsId } from "@/utils/analytics"

import { SettingsPage } from "./SettingsPage"

const BETA_UNLOCK_TAPS = 5

export interface AboutScreenProps {
  onBack: () => void
  onOpenPrivacy: () => void
  onOpenTerms: () => void
  onOpenLicenseAgreement?: () => void
  onOpenCookiePolicy?: () => void
  onOpenGameContentNotices?: () => void
}

export function AboutScreen({
  onBack,
  onOpenPrivacy,
  onOpenTerms,
  onOpenLicenseAgreement,
  onOpenCookiePolicy,
  onOpenGameContentNotices,
}: AboutScreenProps) {
  const [beta, setBeta] = useState(betaUpdatesChosen)
  const [versionTaps, setVersionTaps] = useState(0)
  const [previewError, setPreviewError] = useState("")
  const info = readAppInfo()
  const id = analyticsId()
  const idLine = id ? translate("account:settings.appInfo.analyticsId", { id }) : ""
  return (
    <SettingsPage titleTx="account:settings.about" onBack={onBack} scrollTestID="about-scroll">
      <View>
        <Text
          tx="account:settings.appInfo.heading"
          preset="subheading"
          accessibilityRole="header"
        />
        {APP_INFO_FIELDS.map((field) => {
          const value = info[field]
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
      </View>
      {idLine ? (
        <View>
          <Text size="sm" selectable accessibilityLabel={idLine} text={idLine} />
          <Text size="xs" tone="dim" tx="account:settings.appInfo.analyticsIdHint" />
        </View>
      ) : null}
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
      <View>
        <Text tx="account:legal.heading" preset="subheading" accessibilityRole="header" />
        <ListItem tx="account:legal.privacyPolicy" rightIcon="caretRight" onPress={onOpenPrivacy} />
        <ListItem
          tx="account:legal.termsOfUse"
          rightIcon="caretRight"
          topSeparator
          onPress={onOpenTerms}
        />
        {onOpenLicenseAgreement ? (
          <ListItem
            tx="account:legal.licenseAgreement"
            accessibilityHint={translate("account:legal.licenseAgreementHint")}
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
    </SettingsPage>
  )
}
