import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { router } from "expo-router"
import { Trans } from "react-i18next"

import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
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
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

import { isCommanderFormat } from "../../convex/lib/gameRules"

const BRAND_EYEBROW = "SCRYVE"

// why: Treachery is connected only, so a first local game can't start as it.
const FIRST_GAME_TYPES = {
  suggested: [
    ...FEATURED_GAME_TYPES.filter((type) => !type.system),
    ...FEATURED_GAME_TYPES.filter((type) => type.system && !type.variant),
  ],
  more: gameTypesBySystem(MORE_GAME_TYPES),
}

export interface WhatYouPlayScreenProps {
  defaultPlayerCount: number
  onChoose: (type: GameType) => void
}

export function WhatYouPlayScreen({ defaultPlayerCount, onChoose }: WhatYouPlayScreenProps) {
  const { themed } = useAppTheme()
  const [chosen, setChosen] = useState<GameType>()
  const { configured, sharing, setSharing, saveFailed, saveSharing } = useFirstUseSharing()

  return (
    <Screen preset="fixed" safeAreaEdges={["top", "bottom"]} contentContainerStyle={$styles.flex1}>
      <View style={themed($content)}>
        <View style={themed($body)}>
          <Text text={BRAND_EYEBROW} preset="formLabel" style={themed($eyebrow)} />
          <Text tx="play:whatYouPlay.heading" preset="heading" accessibilityRole="header" />
        </View>
        <ScrollView style={$list} contentContainerStyle={themed($choices)}>
          <GameTypeList
            types={FIRST_GAME_TYPES}
            selectedId={chosen?.id}
            detail={(type) =>
              gameTypeDetail(
                type,
                isCommanderFormat(type.system, type.format) ? COMMANDER_SEATS : defaultPlayerCount,
              )
            }
            onChoose={setChosen}
          />
          <Text tx="play:whatYouPlay.changeLater" size="xs" tone="dim" />
        </ScrollView>
      </View>
      <BottomActionBar style={$bar}>
        <View style={themed($footer)}>
          {configured ? (
            <Switch
              testID="first-use-analytics-switch"
              labelTx="account:shareUsage"
              value={sharing}
              labelPosition="left"
              helperTx="play:whatYouPlay.shareUsageHelper"
              HelperTextProps={{ size: "xs", style: themed($muted) }}
              onValueChange={setSharing}
            />
          ) : null}
          {saveFailed ? (
            <Text accessibilityRole="alert" size="xs" tx="play:whatYouPlay.sharingSaveFailed" />
          ) : null}
          <Text size="xs" tone="dim">
            <Trans
              i18nKey="play:whatYouPlay.acceptance"
              components={{
                terms: (
                  <Text
                    size="xs"
                    accessibilityRole="link"
                    style={themed($link)}
                    onPress={() => router.push("/terms")}
                  />
                ),
                privacy: (
                  <Text
                    size="xs"
                    accessibilityRole="link"
                    style={themed($link)}
                    onPress={() => router.push("/privacy")}
                  />
                ),
              }}
            />
          </Text>
          <Button
            testID="what-you-play-start"
            tx="play:whatYouPlay.play"
            preset="primary"
            style={themed($primaryAction)}
            disabled={!chosen}
            onPress={() => {
              if (!chosen || !saveSharing()) return
              onChoose(chosen)
            }}
          />
        </View>
      </BottomActionBar>
    </Screen>
  )
}

const $column: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 560,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
})
const $content: ThemedStyle<ViewStyle> = (theme) => ({
  ...$column(theme),
  flex: 1,
  gap: theme.spacing.lg,
  paddingTop: theme.spacing.xl,
  paddingBottom: theme.spacing.md,
})
const $bar: ViewStyle = { paddingHorizontal: 0 }
const $body: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $list: ViewStyle = { flex: 1 }
const $choices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $footer: ThemedStyle<ViewStyle> = (theme) => ({ ...$column(theme), gap: theme.spacing.sm })
const $primaryAction: ThemedStyle<ViewStyle> = ({ radius }) => ({ borderRadius: radius.xl })
const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })

const $link: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textDecorationLine: "underline",
})
