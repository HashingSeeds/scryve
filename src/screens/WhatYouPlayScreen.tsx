import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { Trans } from "react-i18next"

import { Button } from "@/components/Button"
import { CHOICE_RADIUS } from "@/components/ChoiceButton"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Switch } from "@/components/Toggle/Switch"
import { GameTypeList } from "@/features/game/GameTypeList"
import {
  FEATURED_GAME_TYPES,
  gameTypeDetail,
  gameTypesBySystem,
  MORE_GAME_TYPES,
  type GameType,
} from "@/features/game/gameTypes"
import { COMMANDER_SEATS } from "@/features/game/whatYouPlay"
import { useFirstUseSharing } from "@/features/legal/useFirstUseSharing"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const BRAND_EYEBROW = "SCRYVE"

// why: Treachery is connected only, so a first local game can't start as it.
const FIRST_GAME_TYPES = {
  suggested: [
    ...FEATURED_GAME_TYPES.filter((type) => !type.system),
    ...FEATURED_GAME_TYPES.filter((type) => type.system && !type.variant),
  ],
  more: gameTypesBySystem(MORE_GAME_TYPES),
}

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
  const { themed } = useAppTheme()
  const [chosen, setChosen] = useState<GameType>()
  const { configured, sharing, setSharing, saveFailed, saveSharing } = useFirstUseSharing()

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
        <GameTypeList
          types={FIRST_GAME_TYPES}
          selectedId={chosen?.id}
          detail={(type) =>
            gameTypeDetail(type, type.format === "commander" ? COMMANDER_SEATS : defaultPlayerCount)
          }
          onChoose={setChosen}
        />
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
const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $primaryAction: ThemedStyle<ViewStyle> = () => ({ borderRadius: CHOICE_RADIUS })
const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })

const $link: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textDecorationLine: "underline",
})
