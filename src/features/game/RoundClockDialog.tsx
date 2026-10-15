import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { playSystemRules, type PlaySystemId } from "./playSystems"
import {
  addRoundBonusTurns,
  adjustRoundClock,
  areRoundTurnsDone,
  callRoundTime,
  pauseRoundClock,
  resumeRoundClock,
  formatRemaining,
  roundClockText,
  roundTurnText,
  stepRoundTurn,
  type RoundClock,
} from "./roundClock"
import type { GamePlayer } from "./types"
import { useRoundClockView } from "./useRoundClockView"

const MINUTE_MS = 60_000
/** why: a Magic Slow Play warning adds two turns to the end-of-round procedure (IPG 3.3). */
const SLOW_PLAY_TURNS = 2

export interface RoundClockDialogProps {
  clock: RoundClock
  system?: PlaySystemId
  players: readonly GamePlayer[]
  onChange: (update: (clock: RoundClock) => RoundClock | undefined) => void
  onClose: () => void
}

export function RoundClockDialog({
  clock,
  system,
  players,
  onChange,
  onClose,
}: RoundClockDialogProps) {
  const { themed } = useAppTheme()
  const view = useRoundClockView(clock, system)
  if (!view) return null
  const paused = clock.pausedAt !== undefined
  const countdown = clock.setup.mode === "countdown"
  const leader = view.kind === "time" && view.turns > 0 ? leaderLine(players, system) : undefined

  return (
    <DialogCard
      visible
      onClose={onClose}
      backdropTestID="round-clock-backdrop"
      backdropAccessibilityLabel="Close round clock"
      dialogTestID="round-clock-dialog"
      accessibilityViewIsModal
    >
      <Text
        testID="round-clock-heading"
        text={view.kind === "time" ? roundTurnText(view) || "Time" : roundClockText(view)}
        preset="heading"
        style={themed($heading)}
      />
      {view.kind === "time" && view.overtimeMs !== undefined ? (
        <Text
          size="xs"
          text={`${formatRemaining(view.overtimeMs)} of overtime left`}
          style={themed($dialogText)}
        />
      ) : null}
      {leader ? <Text size="xs" text={leader} style={themed($dialogText)} /> : null}

      {view.kind === "time" ? (
        view.turns > 0 ? (
          <View style={themed($dialogActions)}>
            <Button
              testID="round-clock-back"
              text="Back"
              disabled={view.turn === 0}
              style={themed($dialogButton)}
              onPress={() => onChange((current) => stepRoundTurn(current, system, -1))}
            />
            <Button
              testID="round-clock-next"
              text="Next turn"
              preset="reversed"
              disabled={areRoundTurnsDone(view)}
              style={themed($dialogButton)}
              onPress={() => onChange((current) => stepRoundTurn(current, system, 1))}
            />
          </View>
        ) : null
      ) : (
        <>
          {countdown ? (
            <View style={themed($dialogActions)}>
              <Button
                testID="round-clock-minus"
                text="−1 min"
                accessibilityLabel="Remove a minute"
                disabled={view.ms <= MINUTE_MS}
                style={themed($dialogButton)}
                onPress={() => onChange((current) => adjustRoundClock(current, -MINUTE_MS))}
              />
              <Button
                testID="round-clock-plus"
                text="+1 min"
                accessibilityLabel="Add a minute"
                style={themed($dialogButton)}
                onPress={() => onChange((current) => adjustRoundClock(current, MINUTE_MS))}
              />
            </View>
          ) : null}
          <Button
            testID="round-clock-pause"
            text={paused ? "Resume" : "Pause"}
            preset="reversed"
            style={themed($wide)}
            onPress={() =>
              onChange((current) => (paused ? resumeRoundClock(current) : pauseRoundClock(current)))
            }
          />
        </>
      )}

      <View style={themed($dialogActions)}>
        {countdown && view.kind === "remaining" ? (
          <Button
            testID="round-clock-call"
            text="Call time"
            style={themed($dialogButton)}
            onPress={() => onChange((current) => callRoundTime(current))}
          />
        ) : null}
        {system === "mtg" && view.kind === "time" ? (
          <Button
            testID="round-clock-bonus"
            text={`+${SLOW_PLAY_TURNS} turns`}
            style={themed($dialogButton)}
            onPress={() => onChange((current) => addRoundBonusTurns(current, SLOW_PLAY_TURNS))}
          />
        ) : null}
        <Button
          testID="round-clock-off"
          text="Turn off"
          style={themed($dialogButton)}
          onPress={() => {
            onChange(() => undefined)
            onClose()
          }}
        />
      </View>
    </DialogCard>
  )
}

/** why: single elimination breaks an unfinished game on the counter, highest life or fewest Prize cards, so players want to see who leads. */
function leaderLine(players: readonly GamePlayer[], system: PlaySystemId | undefined) {
  const counter = playSystemRules(system).counter
  const sign = counter.direction === "down" ? -1 : 1
  const best = Math.max(...players.map(({ life }) => life * sign))
  const leaders = players.filter(({ life }) => life * sign === best)
  if (leaders.length !== 1) return `Tied on ${counter.label.toLowerCase()}`
  return `${leaders[0].name} leads on ${counter.label.toLowerCase()}`
}

const $heading: ThemedStyle<TextStyle> = () => ({
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})
const $wide: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
