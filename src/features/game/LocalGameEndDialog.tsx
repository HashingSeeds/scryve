import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { ChoiceButton, CHOICE_RADIUS } from "@/components/ChoiceButton"
import { DialogCard, $dialogActions, type DialogOrigin } from "@/components/DialogCard"
import { DrawMark, PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { counterValueLabel } from "@/features/game/playSystems"
import type { LocalGame, LocalGameResult, PlayerId } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function LocalGameEndDialog({
  game,
  origin,
  onClose,
  onEnd,
  onAbandon,
}: {
  game: LocalGame
  origin?: DialogOrigin
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
      setError(cause instanceof Error ? cause.message : "Could not end this game.")
    }
  }
  const system = game.system
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<PlayerId[]>([])
  const [drawSelected, setDrawSelected] = useState(false)
  const endResultSelected = winnerPlayerIds.length > 0 || drawSelected
  function toggleWinner(playerId: PlayerId) {
    setDrawSelected(false)
    setWinnerPlayerIds((current) =>
      current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId],
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
      backdropAccessibilityLabel="Cancel ending the game"
      dialogTestID="end-game-dialog"
      dialogAccessibilityRole="alert"
    >
      <View style={themed($dialogHeader)}>
        <Text text="Who won?" preset="subheading" />
        <Text text="Choose a winner or record a draw." size="xs" style={themed($dialogSubtitle)} />
      </View>
      <View style={themed($resultChoices)}>
        {game.players.map((player) => {
          const selected = winnerPlayerIds.includes(player.id)
          return (
            <ChoiceButton
              key={player.id}
              testID={`end-game-winner-${player.seat}`}
              text={player.name}
              detail={counterValueLabel(system, player.life)}
              accentColor={player.color}
              Leading={({ color }) => (
                <PlayerMark seatNumber={player.seat} color={color} size={28} />
              )}
              accessibilityLabel={`${player.name}, ${counterValueLabel(system, player.life)}${selected ? ", winner" : ""}`}
              selected={selected}
              onPress={() => toggleWinner(player.id)}
            />
          )
        })}
        <ChoiceButton
          testID="end-game-result-draw"
          text="Draw"
          accentColor={colors.palette.neutral400}
          Leading={({ color }) => <DrawMark color={color} />}
          selected={drawSelected}
          onPress={selectDraw}
        />
      </View>
      {error ? <AlertNote text={error} /> : null}
      <View style={themed($dialogActions)}>
        <Button
          testID="abandon-game-button"
          text="Abandon"
          disabled={!onAbandon}
          style={themed($dialogAction)}
          onPress={() => onAbandon && finish(onAbandon)}
        />
        <Button
          testID="confirm-end-game-button"
          text="End game"
          disabled={!endResultSelected}
          preset="reversed"
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
const $resultChoices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $dialogAction: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 48,
  borderRadius: CHOICE_RADIUS,
})
