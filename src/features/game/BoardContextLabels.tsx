import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { PlaySystemId } from "./playSystems"
import { roundClockText, type RoundClock, type RoundClockView } from "./roundClock"
import { useRoundClockView } from "./useRoundClockView"

const WARN_MS = 5 * 60_000

export interface BoardContextLabelsProps {
  match?: { line: string; accessibilityLabel: string }
  clock?: RoundClock
  system?: PlaySystemId
  top: number
  bottom: number
  onClockPress?: () => void
}

/** why: the top copy is turned to face the player across the table, and the line ticks on its own so the seats never re-render with the clock. */
export function BoardContextLabels({
  match,
  clock,
  system,
  top,
  bottom,
  onClockPress,
}: BoardContextLabelsProps) {
  const view = useRoundClockView(clock, system)
  const paused = clock?.pausedAt !== undefined
  const pointerEvents = onClockPress ? "box-none" : "none"
  return (
    <>
      <View
        pointerEvents={pointerEvents}
        style={[$layer, { top: top + 4, transform: [{ rotate: "180deg" }] }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        <ContextLine
          testID="match-context-top"
          hidden
          match={match}
          view={view}
          paused={paused}
          onPress={onClockPress}
        />
      </View>
      <View pointerEvents={pointerEvents} style={[$layer, { bottom: bottom + 4 }]}>
        <ContextLine
          testID="match-context"
          match={match}
          view={view}
          paused={paused}
          onPress={onClockPress}
        />
      </View>
    </>
  )
}

function ContextLine({
  testID,
  hidden = false,
  match,
  view,
  paused = false,
  onPress,
}: {
  testID: string
  hidden?: boolean
  match?: BoardContextLabelsProps["match"]
  view?: RoundClockView
  paused?: boolean
  onPress?: () => void
}) {
  const { themed } = useAppTheme()
  const clockText = view ? roundClockText(view) : ""
  // why: seat colors vary, so urgency reads through weight rather than a hue that can vanish on some seats.
  const urgent = view?.kind === "time" || (view?.kind === "remaining" && view.ms <= WARN_MS)
  const line = (
    <Text
      testID={testID}
      size="xxs"
      weight="medium"
      accessibilityLabel={[match?.accessibilityLabel, view && clockLabel(view, clockText, paused)]
        .filter(Boolean)
        .join(". ")}
      style={themed([$text, $line])}
    >
      {match?.line}
      {match && view ? " · " : null}
      {view?.kind === "time" ? (
        <Text size="xxs" weight="semiBold" style={themed($text)} tx="board:clock.time" />
      ) : null}
      {view?.kind === "time" && clockText ? " · " : null}
      {clockText ? (
        <Text size="xxs" weight={urgent ? "semiBold" : "medium"} style={themed($text)}>
          {clockText}
        </Text>
      ) : null}
      {paused ? ` · ${translate("board:clock.paused")}` : null}
    </Text>
  )
  if (!onPress) return line
  return (
    <Pressable
      testID={`${testID}-button`}
      accessibilityRole="button"
      accessibilityHint={translate("board:clock.opensRoundClock")}
      accessible={!hidden}
      focusable={!hidden}
      hitSlop={12}
      onPress={onPress}
    >
      {line}
    </Pressable>
  )
}

function clockLabel(view: RoundClockView, text: string, paused: boolean) {
  if (view.kind === "remaining")
    return translate(paused ? "board:clock.leftPaused" : "board:clock.left", { time: text })
  if (view.kind === "elapsed")
    return translate(paused ? "board:clock.elapsedPaused" : "board:clock.elapsed", { time: text })
  return text ? translate("board:clock.timeWith", { time: text }) : translate("board:clock.time")
}

const $layer: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  zIndex: 60,
  elevation: 60,
  alignItems: "center",
}
const $text: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.board.text })
const $line: ThemedStyle<TextStyle> = () => ({ opacity: 0.8 })
