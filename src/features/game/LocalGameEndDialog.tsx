import { useState } from "react"
import type { ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { DialogCard, $dialogActions, type DialogOrigin } from "@/components/DialogCard"
import { DrawMark, PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { localStandingWinners } from "@/features/game/domain"
import { counterValueLabel } from "@/features/game/playSystems"
import { teamChoices, teamMembers, teamName, teamValueLabel } from "@/features/game/teams"
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
  const groups = game.turnGroups
  const [winnerPlayerIds, setWinnerPlayerIds] = useState<PlayerId[]>(
    () => localStandingWinners(game) ?? [],
  )
  const [drawSelected, setDrawSelected] = useState(false)
  const endResultSelected = winnerPlayerIds.length > 0 || drawSelected
  // why: a team wins together, so choosing it chooses every seat in it.
  function toggleWinner(playerId: PlayerId) {
    setDrawSelected(false)
    const team = teamMembers(game.players, groups, playerId).map(({ id }) => id)
    setWinnerPlayerIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => !team.includes(id))
        : singleWinner
          ? team
          : [...current, ...team],
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
        <Text tx="board:endGame.subtitle" size="xs" tone="dim" />
      </View>
      <ScrollView style={$resultScroll} contentContainerStyle={themed($resultChoices)}>
        {teamChoices(game.players, groups).map((player) => {
          const selected = winnerPlayerIds.includes(player.id)
          const seat = game.players.indexOf(player)
          const name = teamName(game.players, groups, player.id) ?? player.name
          const value = teamValueLabel(game.players, groups, player.id, (life) =>
            counterValueLabel(system, life),
          )
          return (
            <ChoiceButton
              key={player.id}
              testID={`end-game-winner-${player.seat}`}
              text={name}
              detail={value}
              accentColor={player.color}
              Leading={({ color }) => (
                <PlayerMark seatNumber={seat + 1} shape={player.shape} color={color} size={28} />
              )}
              accessibilityLabel={translate(
                selected ? "board:endGame.playerWinner" : "board:endGame.player",
                { name, value },
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
      <Button
        testID="abandon-game-button"
        tx="board:endGame.abandon"
        disabled={!onAbandon}
        style={themed($wideAction)}
        onPress={() => onAbandon && finish(onAbandon)}
      />
      <View style={themed($dialogActions)}>
        <Button
          testID="cancel-end-game-button"
          tx="common:cancel"
          style={themed($dialogAction)}
          onPress={onClose}
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
const $resultScroll: ViewStyle = { flexGrow: 0, flexShrink: 1 }
const $resultChoices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $wideAction: ThemedStyle<ViewStyle> = ({ radius }) => ({
  minHeight: 48,
  borderRadius: radius.xl,
})
const $dialogAction: ThemedStyle<ViewStyle> = (theme) => ({ ...$wideAction(theme), flex: 1 })
