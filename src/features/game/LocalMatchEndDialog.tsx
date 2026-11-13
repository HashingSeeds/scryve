import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { DialogCard, $dialogActions } from "@/components/DialogCard"
import { PlayerMark } from "@/components/PlayerMark"
import { SegmentedControl } from "@/components/SegmentedControl"
import { $sheetScroll, $sheetScrollContent } from "@/components/sheetStyles"
import { Text } from "@/components/Text"
import { localOutReason, matchScoreAfter } from "@/features/game/domain"
import type { LocalGame, MatchSeatOutcome } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { PlayerMarkShape } from "../../../convex/lib/appearance"
import { assertGameScores, type MatchBestOf } from "../../../convex/lib/matchResults"

const OUTCOMES = ["win", "loss", "draw"] as const satisfies readonly MatchSeatOutcome[]

/** why: assertGameScores is shared with the server and throws English; matching its exact text here keeps convex/ unchanged for installed clients. */
const SCORE_ERRORS: readonly [RegExp, (groups: string[]) => string][] = [
  [
    /^Games won must be 0–(\d+) in a best of (\d+)$/,
    ([max, bestOf]) => translate("board:matchEnd.scoreErrors.gamesWonRange", { max, bestOf }),
  ],
  [
    /^Games drawn must be 0–(\d+)$/,
    ([max]) => translate("board:matchEnd.scoreErrors.gamesDrawnRange", { max }),
  ],
  [
    /^A best of (\d+) cannot have (\d+) wins$/,
    ([bestOf, wins]) => translate("board:matchEnd.scoreErrors.tooManyWins", { bestOf, wins }),
  ],
  [
    /^Enter games won for every seat or leave the score blank$/,
    () => translate("board:matchEnd.scoreErrors.partialScore"),
  ],
  [/^A match can only have one winner$/, () => translate("board:matchEnd.scoreErrors.oneWinner")],
  [
    /^A match needs a winner unless it was drawn$/,
    () => translate("board:matchEnd.scoreErrors.needsWinner"),
  ],
  [
    /^The winner must have the most game wins$/,
    () => translate("board:matchEnd.scoreErrors.winnerLeads"),
  ],
  [
    /^The seat with the most game wins must be the winner$/,
    () => translate("board:matchEnd.scoreErrors.leaderWins"),
  ],
]

function gameScoresErrorMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : ""
  for (const [pattern, describe] of SCORE_ERRORS) {
    const match = pattern.exec(message)
    if (match) return describe(match.slice(1))
  }
  return cause instanceof Error ? cause.message : translate("board:matchEnd.failed")
}

export interface MatchEndSeat {
  id: string
  name: string
  color: string
  shape?: PlayerMarkShape
  wins: number
  out: boolean
}

export interface MatchEndScore {
  bestOf: MatchBestOf
  seats: readonly MatchEndSeat[]
  draws: number
  lastGameDrawn: boolean
}

function drawForRemaining(seats: readonly MatchEndSeat[]): MatchSeatOutcome[] {
  return seats.map(({ out }) => (out ? "loss" : "draw"))
}

function defaultOutcomes({ seats, lastGameDrawn }: MatchEndScore): MatchSeatOutcome[] {
  const most = Math.max(...seats.map(({ wins }) => wins))
  const leaders = seats.filter(({ wins }) => wins === most)
  if (!lastGameDrawn && most > 0 && leaders.length === 1)
    return seats.map(({ wins }) => (wins === most ? "win" : "loss"))
  return drawForRemaining(seats)
}

function localMatchScore(game: LocalGame): MatchEndScore {
  const score = matchScoreAfter(game)
  return {
    bestOf: game.match?.bestOf ?? 1,
    seats: game.players.map((player, seat) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      shape: player.shape,
      wins: score.wins[seat],
      out: Boolean(localOutReason(game, player.id)),
    })),
    draws: score.draws,
    lastGameDrawn: game.result?.kind === "draw",
  }
}

export function defaultMatchOutcomes(game: LocalGame): MatchSeatOutcome[] {
  return defaultOutcomes(localMatchScore(game))
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
  return <MatchEndDialog score={localMatchScore(game)} onClose={onClose} onEnd={onEnd} />
}

export function MatchEndDialog({
  score,
  failure,
  busy,
  onClose,
  onEnd,
}: {
  score: MatchEndScore
  failure?: string
  busy?: boolean
  onClose: () => void
  onEnd: (outcomes: MatchSeatOutcome[]) => void
}) {
  const { themed } = useAppTheme()
  const [outcomes, setOutcomes] = useState(() => defaultOutcomes(score))
  const [error, setError] = useState<string>()
  const shownError = error ?? failure
  const segments = OUTCOMES.map((id) => ({ id, label: translate(`board:matchEnd.outcome.${id}`) }))

  function choose(seat: number, outcome: MatchSeatOutcome) {
    setError(undefined)
    setOutcomes((current) => current.map((value, index) => (index === seat ? outcome : value)))
  }

  function drawRemaining() {
    setError(undefined)
    setOutcomes(drawForRemaining(score.seats))
  }

  function confirm() {
    try {
      assertGameScores(
        outcomes.map((outcome, seat) => ({
          outcome,
          gamesWon: score.seats[seat].wins,
          gamesDrawn: score.draws,
        })),
        score.bestOf,
      )
      onEnd(outcomes)
    } catch (cause) {
      setError(gameScoresErrorMessage(cause))
    }
  }

  return (
    <DialogCard
      visible
      onClose={onClose}
      backdropTestID="end-match-backdrop"
      backdropAccessibilityLabel={translate("board:matchEnd.cancel")}
      dialogTestID="end-match-dialog"
      dialogAccessibilityRole="alert"
      wide
    >
      <Text tx="board:matchEnd.title" preset="subheading" />
      <ScrollView
        style={themed($sheetScroll)}
        contentContainerStyle={themed([$sheetScrollContent, $seats])}
      >
        {score.seats.map((player, seat) => (
          <View key={player.id} style={themed($seat)}>
            <View style={themed($seatName)}>
              <PlayerMark
                seatNumber={seat + 1}
                shape={player.shape}
                color={player.color}
                size={24}
              />
              <Text text={player.name} numberOfLines={1} style={themed($name)} />
              <Text text={String(player.wins)} size="xs" tone="dim" />
            </View>
            <View style={themed($seatOutcome)}>
              <SegmentedControl
                testID={`match-outcome-${seat}`}
                accessibilityLabel={translate("board:matchEnd.playerResult", { name: player.name })}
                segments={segments}
                selectedId={outcomes[seat]}
                onSelect={(id) => {
                  const chosen = OUTCOMES.find((outcome) => outcome === id)
                  if (chosen) choose(seat, chosen)
                }}
              />
            </View>
          </View>
        ))}
      </ScrollView>
      <Button
        testID="match-draw-remaining"
        tx="board:matchEnd.drawRemaining"
        accessibilityHint={translate("board:matchEnd.drawRemainingHint")}
        onPress={drawRemaining}
      />
      {shownError ? <AlertNote text={shownError} /> : null}
      <View style={themed($dialogActions)}>
        <Button tx="common:cancel" style={themed($dialogAction)} onPress={onClose} />
        <Button
          testID="confirm-end-match-button"
          tx="board:matchEnd.end"
          preset="primary"
          disabled={busy}
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
const $seatOutcome: ThemedStyle<ViewStyle> = () => ({ flexGrow: 1, flexBasis: 200 })
const $dialogAction: ThemedStyle<ViewStyle> = ({ radius }) => ({
  flex: 1,
  minHeight: 48,
  borderRadius: radius.xl,
})
