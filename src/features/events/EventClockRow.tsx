import { useEffect, useReducer } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { formatRemaining } from "@/features/game/roundClock"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { remainingMs } from "./eventLogic"
import type { ClockAction, EventClock } from "../../../convex/lib/events/commands"

/** why: device clocks are trusted for the MVP, so each phone counts down from the event's timestamps itself. */
function useRemaining(clock: EventClock) {
  const [, tick] = useReducer((count: number) => count + 1, 0)
  const left = remainingMs(clock, Date.now())
  const ticking = clock.pausedAt === undefined && left > 0
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(tick, 1_000)
    return () => clearInterval(timer)
  }, [ticking])
  return left
}

export function EventClockRow({
  clock,
  busy,
  onAction,
}: {
  clock: EventClock
  busy?: boolean
  onAction?: (action: ClockAction) => void
}) {
  const { themed } = useAppTheme()
  const left = useRemaining(clock)
  const paused = clock.pausedAt !== undefined
  return (
    <View style={themed($row)}>
      <View style={$time}>
        <Text
          testID="event-clock"
          preset="heading"
          accessibilityRole="timer"
          style={$digits}
          text={left > 0 ? formatRemaining(left) : translate("events:clock.timeUp")}
        />
        {paused ? <Text size="xs" tone="dim" tx="events:clock.paused" /> : null}
      </View>
      {onAction ? (
        <View style={themed($controls)}>
          <Button
            testID="clock-minus"
            tx="events:clock.minus"
            disabled={busy}
            style={$control}
            onPress={() => onAction({ kind: "adjust", minutes: -1 })}
          />
          <Button
            testID="clock-plus"
            tx="events:clock.plus"
            disabled={busy}
            style={$control}
            onPress={() => onAction({ kind: "adjust", minutes: 1 })}
          />
          <Button
            testID="clock-toggle"
            tx={paused ? "events:clock.resume" : "events:clock.pause"}
            disabled={busy}
            style={$control}
            onPress={() => onAction({ kind: paused ? "resume" : "pause" })}
          />
        </View>
      ) : null}
    </View>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $digits: TextStyle = { fontVariant: ["tabular-nums"] }
const $time: ViewStyle = { flexDirection: "row", alignItems: "baseline", gap: 8 }
const $controls: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $control: ViewStyle = { flex: 1, minHeight: 44 }
