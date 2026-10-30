import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { DialogCard, $dialogActions, type DialogOrigin } from "@/components/DialogCard"
import { DrawMark, PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { lastPlayerStanding } from "@/features/game/domain"
import { counterValueLabel } from "@/features/game/playSystems"
import type { LocalGame, LocalGameResult, PlayerId } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function LocalGameEndDialog({
  game,
  origin,
  singleWinner = false,
  onClose,
  onEnd,
  onAbandon,
}: {
  game: LocalGame
  origin?: DialogOrigin
  singleWinner?: boolean
  onClose: () => void
  onEnd: (result: LocalGameResult) => void
  onAbandon?: () => void
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const [error, setError] = useState<string>()
  function finish(action: () => void) {
    setError(undefined)
    try {
      action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : translate("board:endGame.failed"))
    }
  }
  const system = game.system
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<PlayerId[]>(() => {
    const standing = lastPlayerStanding(game)
    return standing ? [standing] : []
  })
  const [drawSelected, setDrawSelected] = useState(false)
  const endResultSelected = winnerPlayerIds.length > 0 || drawSelected
  function toggleWinner(playerId: PlayerId) {
    setDrawSelected(false)
    setWinnerPlayerIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : singleWinner
          ? [playerId]
          : [...current, playerId],
    )
  }
  function selectDraw() {
    setWinnerPlayerIds([])
    setDrawSelected((current) => !current)
  }
  return (
    <DialogCard
      visible
      onClose={onClose}
      origin={origin}
      backdropTestID="end-game-backdrop"
      backdropAccessibilityLabel={translate("board:endGame.cancel")}
      dialogTestID="end-game-dialog"
      dialogAccessibilityRole="alert"
    >
      <View style={themed($dialogHeader)}>
        <Text tx="board:endGame.title" preset="subheading" />
        <Text tx="board:endGame.subtitle" size="xs" style={themed($dialogSubtitle)} />
      </View>
      <ScrollView style={$resultScroll} contentContainerStyle={themed($resultChoices)}>
        {game.players.map((player, seat) => {
          const selected = winnerPlayerIds.includes(player.id)
          return (
            <ChoiceButton
              key={player.id}
              testID={`end-game-winner-${player.seat}`}
              text={player.name}
              detail={counterValueLabel(system, player.life)}
              accentColor={player.color}
              Leading={({ color }) => (
                <PlayerMark seatNumber={seat + 1} shape={player.shape} color={color} size={28} />
              )}
              accessibilityLabel={translate(
                selected ? "board:endGame.playerWinner" : "board:endGame.player",
                { name: player.name, value: counterValueLabel(system, player.life) },
              )}
              selected={selected}
              onPress={() => toggleWinner(player.id)}
            />
          )
        })}
        <ChoiceButton
          testID="end-game-result-draw"
          text={translate("board:endGame.draw")}
          accentColor={colors.palette.neutral400}
          Leading={({ color }) => <DrawMark color={color} />}
          selected={drawSelected}
          onPress={selectDraw}
        />
      </ScrollView>
      {error ? <AlertNote text={error} /> : null}
      <View style={themed($dialogActions)}>
        <Button
          testID="abandon-game-button"
          tx="board:endGame.abandon"
          disabled={!onAbandon}
          style={themed($dialogAction)}
          onPress={() => onAbandon && finish(onAbandon)}
        />
        <Button
          testID="confirm-end-game-button"
          tx="board:endGame.end"
          disabled={!endResultSelected}
          preset="primary"
          style={themed($dialogAction)}
          onPress={() =>
            finish(() =>
              onEnd(winnerPlayerIds.length ? { kind: "win", winnerPlayerIds } : { kind: "draw" }),
            )
          }
        />
      </View>
    </DialogCard>
  )
}

const $dialogHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $dialogSubtitle: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $resultScroll: ViewStyle = { flexGrow: 0, flexShrink: 1 }
const $resultChoices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $dialogAction: ThemedStyle<ViewStyle> = ({ radius }) => ({
  flex: 1,
  minHeight: 48,
  borderRadius: radius.lg,
})
