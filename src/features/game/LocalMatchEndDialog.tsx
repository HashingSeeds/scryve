import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { CHOICE_RADIUS } from "@/components/ChoiceButton"
import { DialogCard, $dialogActions } from "@/components/DialogCard"
import { PlayerMark } from "@/components/PlayerMark"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { isPlayerOut, matchScoreAfter } from "@/features/game/domain"
import type { LocalGame, MatchSeatOutcome } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { assertGameScores } from "../../../convex/lib/matchResults"

const OUTCOME_SEGMENTS = [
  { id: "win", label: "Win" },
  { id: "loss", label: "Loss" },
  { id: "draw", label: "Draw" },
] as const

function drawForRemaining(game: LocalGame): MatchSeatOutcome[] {
  return game.players.map((player) => (isPlayerOut(game, player.id) ? "loss" : "draw"))
}

/** why: a match usually ends the way its score says; a called round draws whoever is still playing. */
export function defaultMatchOutcomes(game: LocalGame): MatchSeatOutcome[] {
  const { wins } = matchScoreAfter(game)
  const most = Math.max(...wins)
  const leaders = wins.filter((count) => count === most)
  if (game.result?.kind !== "draw" && most > 0 && leaders.length === 1)
    return wins.map((count) => (count === most ? "win" : "loss"))
  return drawForRemaining(game)
}

export function LocalMatchEndDialog({
  game,
  onClose,
  onEnd,
}: {
  game: LocalGame
  onClose: () => void
  onEnd: (outcomes: MatchSeatOutcome[]) => void
}) {
  const { themed } = useAppTheme()
  const match = game.match
  const [outcomes, setOutcomes] = useState(() => defaultMatchOutcomes(game))
  const [error, setError] = useState<string>()
  const score = matchScoreAfter(game)

  function choose(seat: number, outcome: MatchSeatOutcome) {
    setError(undefined)
    setOutcomes((current) => current.map((value, index) => (index === seat ? outcome : value)))
  }

  function drawRemaining() {
    setError(undefined)
    setOutcomes(drawForRemaining(game))
  }

  function confirm() {
    if (!match) return
    try {
      assertGameScores(
        outcomes.map((outcome, seat) => ({
          outcome,
          gamesWon: score.wins[seat],
          gamesDrawn: score.draws,
        })),
        match.bestOf,
      )
      onEnd(outcomes)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not end this match.")
    }
  }

  return (
    <DialogCard
      visible
      onClose={onClose}
      backdropTestID="end-match-backdrop"
      backdropAccessibilityLabel="Cancel ending the match"
      dialogTestID="end-match-dialog"
      dialogAccessibilityRole="alert"
      wide
    >
      <Text text="Match result" preset="subheading" />
      <View style={themed($seats)}>
        {game.players.map((player, seat) => (
          <View key={player.id} style={themed($seat)}>
            <View style={themed($seatName)}>
              <PlayerMark
                seatNumber={seat + 1}
                shape={player.shape}
                color={player.color}
                size={24}
              />
              <Text text={player.name} numberOfLines={1} style={themed($name)} />
              <Text text={String(score.wins[seat])} size="xs" style={themed($wins)} />
            </View>
            <View style={themed($seatOutcome)}>
              <SegmentedControl
                testID={`match-outcome-${seat}`}
                accessibilityLabel={`${player.name} match result`}
                segments={OUTCOME_SEGMENTS}
                selectedId={outcomes[seat]}
                onSelect={(id) => {
                  const chosen = OUTCOME_SEGMENTS.find((segment) => segment.id === id)
                  if (chosen) choose(seat, chosen.id)
                }}
              />
            </View>
          </View>
        ))}
      </View>
      <Button
        testID="match-draw-remaining"
        text="Draw for remaining"
        accessibilityHint="Draws every seat still playing and gives eliminated seats a loss"
        onPress={drawRemaining}
      />
      {error ? <AlertNote text={error} /> : null}
      <View style={themed($dialogActions)}>
        <Button text="Cancel" style={themed($dialogAction)} onPress={onClose} />
        <Button
          testID="confirm-end-match-button"
          text="End match"
          preset="reversed"
          style={themed($dialogAction)}
          onPress={confirm}
        />
      </View>
    </DialogCard>
  )
}

const $seats: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $seat: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "center",
  gap: spacing.xs,
})
const $seatName: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  flexGrow: 1,
  flexBasis: 120,
})
const $name: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })
const $wins: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $seatOutcome: ThemedStyle<ViewStyle> = () => ({ flexGrow: 1, flexBasis: 200 })
const $dialogAction: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 48,
  borderRadius: CHOICE_RADIUS,
})
