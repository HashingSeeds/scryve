import { useState } from "react"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { Trans } from "react-i18next"

import { Button } from "@/components/Button"
import { CHOICE_RADIUS, ChoiceButton } from "@/components/ChoiceButton"
import { Icon } from "@/components/Icon"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Switch } from "@/components/Toggle/Switch"
import {
  FEATURED_GAME_TYPES,
  gameTypeDetail,
  gameTypeLabel,
  MORE_GAME_TYPES,
  type GameType,
} from "@/features/game/gameTypes"
import { COMMANDER_SEATS } from "@/features/game/whatYouPlay"
import { useFirstUseSharing } from "@/features/legal/useFirstUseSharing"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const BRAND_EYEBROW = "SCRYVE"

// why: Treachery is connected only, so a first local game can't start as it.
const FIRST_GAME_TYPES = [
  ...FEATURED_GAME_TYPES.filter((type) => !type.system),
  ...FEATURED_GAME_TYPES.filter((type) => type.system && !type.variant),
]

export interface LegalAcceptance {
  isSubmitting?: boolean
  onOpenTerms: () => void
  onOpenPrivacy: () => void
}

export interface WhatYouPlayScreenProps {
  defaultPlayerCount: number
  acceptsLegal?: LegalAcceptance
  onChoose: (type: GameType) => void
}

export function WhatYouPlayScreen({
  defaultPlayerCount,
  acceptsLegal,
  onChoose,
}: WhatYouPlayScreenProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const [chosen, setChosen] = useState<GameType>()
  const [allFormatsShown, setAllFormatsShown] = useState(false)
  const { configured, sharing, setSharing, saveFailed, saveSharing } = useFirstUseSharing()
  const types = allFormatsShown ? [...FIRST_GAME_TYPES, ...MORE_GAME_TYPES] : FIRST_GAME_TYPES

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["top", "bottom"]}
      contentContainerStyle={themed($screen)}
    >
      <View style={themed($body)}>
        <Text text={BRAND_EYEBROW} preset="formLabel" style={themed($eyebrow)} />
        <Text tx="play:whatYouPlay.heading" preset="heading" accessibilityRole="header" />
      </View>
      <ScrollView style={$list} contentContainerStyle={themed($choices)}>
        {types.map((type) => (
          <ChoiceButton
            key={type.id}
            testID={`what-you-play-${type.id}`}
            text={gameTypeLabel(type)}
            detail={gameTypeDetail(
              type,
              type.format === "commander" ? COMMANDER_SEATS : defaultPlayerCount,
            )}
            detailShrinks
            selected={chosen?.id === type.id}
            onPress={() => setChosen(type)}
          />
        ))}
        {allFormatsShown ? null : (
          <Button
            testID="what-you-play-all-formats"
            text={translate("play:whatYouPlay.showMoreFormats", { count: MORE_GAME_TYPES.length })}
            accessibilityState={{ expanded: false }}
            style={themed($showMore)}
            textStyle={themed($showMoreText)}
            RightAccessory={({ style }) => (
              <Icon
                icon="caretRight"
                size={14}
                color={colors.tint}
                containerStyle={style}
                style={$caretDown}
              />
            )}
            onPress={() => setAllFormatsShown(true)}
          />
        )}
        <Text tx="play:whatYouPlay.changeLater" size="xs" style={themed($muted)} />
      </ScrollView>
      <View style={themed($footer)}>
        {acceptsLegal && configured ? (
          <Switch
            testID="first-use-analytics-switch"
            labelTx="account:shareUsage"
            value={sharing}
            labelPosition="left"
            helperTx="account:legalConsent.shareUsageHelper"
            HelperTextProps={{ size: "xs", style: themed($muted) }}
            onValueChange={setSharing}
          />
        ) : null}
        {saveFailed ? (
          <Text accessibilityRole="alert" size="xs" tx="account:legalConsent.sharingSaveFailed" />
        ) : null}
        {acceptsLegal ? (
          <Text size="xs" style={themed($muted)}>
            <Trans
              i18nKey="play:whatYouPlay.acceptance"
              components={{
                terms: (
                  <Text
                    size="xs"
                    accessibilityRole="link"
                    style={themed($link)}
                    onPress={acceptsLegal.onOpenTerms}
                  />
                ),
                privacy: (
                  <Text
                    size="xs"
                    accessibilityRole="link"
                    style={themed($link)}
                    onPress={acceptsLegal.onOpenPrivacy}
                  />
                ),
              }}
            />
          </Text>
        ) : null}
        <Button
          testID="what-you-play-start"
          tx="play:whatYouPlay.play"
          preset="reversed"
          style={themed($primaryAction)}
          disabled={!chosen || acceptsLegal?.isSubmitting}
          onPress={() => {
            if (!chosen || (acceptsLegal && !saveSharing())) return
            onChoose(chosen)
          }}
        />
      </View>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 560,
  alignSelf: "center",
  flex: 1,
  gap: spacing.lg,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.xl,
  paddingBottom: spacing.md,
})
const $body: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $list: ViewStyle = { flex: 1 }
const $choices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $showMore: ThemedStyle<ViewStyle> = () => ({
  alignSelf: "center",
  borderWidth: 0,
  paddingHorizontal: 0,
  backgroundColor: "transparent",
})
const $showMoreText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $caretDown: ImageStyle = { transform: [{ rotate: "90deg" }] }
const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $primaryAction: ThemedStyle<ViewStyle> = () => ({ borderRadius: CHOICE_RADIUS })
const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })

const $link: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textDecorationLine: "underline",
})
