import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
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
import { counterStanding, systemDefinition } from "../../../convex/lib/systems"

const MINUTE_MS = 60_000

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
  const slowPlayTurns = systemDefinition(system)?.roundClock.slowPlayTurns
  if (!view) return null
  const paused = clock.pausedAt !== undefined
  const countdown = clock.setup.mode === "countdown"
  const leader = view.kind === "time" && view.turns > 0 ? leaderLine(players, system) : undefined

  return (
    <DialogCard
      visible
      onClose={onClose}
      backdropTestID="round-clock-backdrop"
      backdropAccessibilityLabel={translate("board:roundClock.close")}
      dialogTestID="round-clock-dialog"
      accessibilityViewIsModal
    >
      <Text
        testID="round-clock-heading"
        text={
          view.kind === "time"
            ? roundTurnText(view) || translate("board:clock.time")
            : roundClockText(view)
        }
        preset="heading"
        style={themed($heading)}
      />
      {view.kind === "time" && view.overtimeMs !== undefined ? (
        <Text
          size="xs"
          text={translate("board:roundClock.overtimeLeft", {
            time: formatRemaining(view.overtimeMs),
          })}
          style={themed($dialogText)}
        />
      ) : null}
      {leader ? <Text size="xs" text={leader} style={themed($dialogText)} /> : null}

      {view.kind === "time" ? (
        view.turns > 0 ? (
          <View style={themed($dialogActions)}>
            <Button
              testID="round-clock-back"
              tx="common:back"
              disabled={view.turn === 0}
              style={themed($dialogButton)}
              onPress={() => onChange((current) => stepRoundTurn(current, system, -1))}
            />
            <Button
              testID="round-clock-next"
              tx="board:roundClock.nextTurn"
              preset="primary"
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
                tx="board:roundClock.minusMinute"
                accessibilityLabel={translate("board:roundClock.removeMinute")}
                disabled={view.ms <= MINUTE_MS}
                style={themed($dialogButton)}
                onPress={() => onChange((current) => adjustRoundClock(current, -MINUTE_MS))}
              />
              <Button
                testID="round-clock-plus"
                tx="board:roundClock.plusMinute"
                accessibilityLabel={translate("board:roundClock.addMinute")}
                style={themed($dialogButton)}
                onPress={() => onChange((current) => adjustRoundClock(current, MINUTE_MS))}
              />
            </View>
          ) : null}
          <Button
            testID="round-clock-pause"
            tx={paused ? "board:roundClock.resume" : "board:roundClock.pause"}
            preset="primary"
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
            tx="board:roundClock.callTime"
            style={themed($dialogButton)}
            onPress={() => onChange((current) => callRoundTime(current))}
          />
        ) : null}
        {slowPlayTurns !== undefined && view.kind === "time" ? (
          <Button
            testID="round-clock-bonus"
            tx="board:roundClock.bonusTurns"
            txOptions={{ count: slowPlayTurns }}
            style={themed($dialogButton)}
            onPress={() => onChange((current) => addRoundBonusTurns(current, slowPlayTurns))}
          />
        ) : null}
        <Button
          testID="round-clock-off"
          tx="board:roundClock.turnOff"
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
  const best = Math.max(...players.map(({ life }) => counterStanding(counter, life)))
  const leaders = players.filter(({ life }) => counterStanding(counter, life) === best)
  const id = playSystemRules(system).id
  if (leaders.length !== 1) return translate(`board:roundClock.tied.${id}`)
  return translate(`board:roundClock.leads.${id}`, { name: leaders[0].name })
}

const $heading: ThemedStyle<TextStyle> = () => ({
  textAlign: "center",
  fontVariant: ["tabular-nums"],
})
const $wide: ThemedStyle<ViewStyle> = () => ({ minHeight: 48 })
