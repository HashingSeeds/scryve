import type { TextStyle, ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { PLAYER_COLORS } from "@/features/game/domain"
import { playSystemRules } from "@/features/game/playSystems"
import { recentSetupLabel, type RecentSetup } from "@/features/game/recentSetups"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { dayLabel } from "./historyEntries"

export interface StartGameScreenProps {
  setups: readonly RecentSetup[]
  now: number
  blockedReason: (setup: RecentSetup) => string | undefined
  error?: string
  onRetry?: () => void
  onReplay: (setup: RecentSetup) => void
  onNewSetup: () => void
  onJoin: () => void
  onBack: () => void
}

function setupDetail(setup: RecentSetup) {
  const { system } = setup.mode === "local" ? setup.game : setup.lobby
  const systemLabel = system ? playSystemRules(system).shortLabel : undefined
  if (setup.mode === "connected")
    return systemLabel
      ? translate("play:recentSetups.connectedSeats", {
          system: systemLabel,
          count: setup.lobby.playerCount,
        })
      : translate("play:recentSetups.connectedSeatsNoSystem", { count: setup.lobby.playerCount })
  const names = setup.game.players.map((player) => player.name.trim()).join(", ")
  return systemLabel
    ? translate("play:recentSetups.onThisDevice", { system: systemLabel, names })
    : translate("play:recentSetups.onThisDeviceNoSystem", { names })
}

function setupColors(setup: RecentSetup) {
  return setup.mode === "local"
    ? setup.game.players.map((player) => player.color)
    : PLAYER_COLORS.slice(0, setup.lobby.playerCount)
}

export function StartGameScreen({
  setups,
  now,
  blockedReason,
  error,
  onRetry,
  onReplay,
  onNewSetup,
  onJoin,
  onBack,
}: StartGameScreenProps) {
  const { themed } = useAppTheme()
  return (
    <Screen preset="scroll" safeAreaEdges={["top", "bottom"]} contentContainerStyle={themed($form)}>
      <Header titleTx="play:newGame.newTitle" leftTx="common:back" onLeftPress={onBack} />
      <Text tx="play:recentSetups.title" preset="subheading" accessibilityRole="header" />
      <View>
        {setups.map((setup, index) => {
          const reason = blockedReason(setup)
          const label = recentSetupLabel(setup)
          const detail = reason ?? setupDetail(setup)
          const when = dayLabel(setup.savedAt, now)
          return (
            <TouchableOpacity
              key={`${setup.savedAt}-${index}`}
              testID={`recent-setup-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${detail}, ${when}`}
              accessibilityState={{ disabled: Boolean(reason) }}
              disabled={Boolean(reason)}
              activeOpacity={0.75}
              style={[themed($row), reason ? themed($blocked) : null]}
              onPress={() => onReplay(setup)}
            >
              <View style={themed($copy)}>
                <Text weight="medium" numberOfLines={1} text={label} />
                <Text size="xxs" numberOfLines={1} style={themed($dim)} text={detail} />
              </View>
              <View style={themed($trailing)}>
                <View style={themed($marks)}>
                  {setupColors(setup).map((color, seat) => (
                    <View key={seat} style={[themed($mark), { backgroundColor: color }]} />
                  ))}
                </View>
                <Text size="xxs" style={themed($dim)} text={when} />
              </View>
            </TouchableOpacity>
          )
        })}
        <TouchableOpacity
          testID="new-setup-button"
          accessibilityRole="button"
          activeOpacity={0.75}
          style={themed($row)}
          onPress={onNewSetup}
        >
          <Text weight="medium" style={themed($link)} tx="play:recentSetups.newSetup" />
        </TouchableOpacity>
        <TouchableOpacity
          testID="join-with-code-button"
          accessibilityRole="button"
          activeOpacity={0.75}
          style={themed($row)}
          onPress={onJoin}
        >
          <Text weight="medium" style={themed($link)} tx="play:newGame.joinWithCode" />
        </TouchableOpacity>
      </View>
      {error ? <AlertNote testID="start-game-error" text={error} /> : null}
      {error && onRetry ? (
        <Button testID="retry-start-game-button" tx="common:tryAgain" onPress={onRetry} />
      ) : null}
    </Screen>
  )
}

const $form: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.lg,
  gap: spacing.sm,
})
const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 64,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $blocked: ThemedStyle<ViewStyle> = () => ({ opacity: 0.45 })
const $copy: ThemedStyle<ViewStyle> = () => ({ flex: 1, gap: 2 })
const $trailing: ThemedStyle<ViewStyle> = () => ({ alignItems: "flex-end", gap: 4 })
const $marks: ThemedStyle<ViewStyle> = () => ({ flexDirection: "row", gap: 3 })
const $mark: ThemedStyle<ViewStyle> = () => ({ width: 12, height: 12, borderRadius: 3 })
const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
