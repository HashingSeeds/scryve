import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { BoardPressable } from "@/components/BoardPressable"
import type { LifeCardContentRotation, LifeCardEdge } from "@/components/playerCardTypes"
import { CONTENT_EDGES } from "@/components/playerGridGeometry"
import { seatIdentityBottomGap, seatIdentityMetrics } from "@/components/SeatIdentity"
import { Text } from "@/components/Text"
import { separator } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { PlaySystemId } from "./playSystems"
import { roundClockText, type RoundClock, type RoundClockView } from "./roundClock"
import { useRoundClockView } from "./useRoundClockView"

const WARN_MS = 5 * 60_000

const LINE_HEIGHT = 18
const IDENTITY_CLEARANCE = 4
const TURNS: readonly LifeCardContentRotation[] = [0, 90, 180, -90]

export type ContextLabelPlacement = ReturnType<typeof contextLabelPlacements>[number]

/** why: a line centred on the screen crossed the seam of a board drawn sideways and ran under a narrow seat's name and 1st chip, so each copy sits in one seat's own edge, just above that seat's identity row. `rotation` turns a board drawn sideways onto the screen. */
export function contextLabelPlacements({
  facings,
  rotation = 0,
  size,
  insets,
  compact,
}: {
  facings: readonly LifeCardContentRotation[]
  rotation?: number
  size: { width: number; height: number }
  insets: Record<LifeCardEdge, number>
  compact?: boolean
}) {
  const { edge, icon } = seatIdentityMetrics(compact)
  return facings.map((facing) => {
    const turn = TURNS[((((facing + rotation) / 90) % 4) + 4) % 4]
    const side = CONTENT_EDGES[turn].bottom
    const inset = insets[side]
    const depth =
      inset + seatIdentityBottomGap(edge, inset) + icon + IDENTITY_CLEARANCE + LINE_HEIGHT / 2
    const sideways = side === "left" || side === "right"
    const run = sideways ? size.height : size.width
    const x = side === "left" ? depth : side === "right" ? size.width - depth : size.width / 2
    const y = side === "top" ? depth : side === "bottom" ? size.height - depth : size.height / 2
    return { left: x - run / 2, top: y - LINE_HEIGHT / 2, width: run, turn }
  })
}

export interface BoardContextLabelsProps {
  match?: { line: string; accessibilityLabel: string }
  clock?: RoundClock
  system?: PlaySystemId
  placements: readonly ContextLabelPlacement[]
  onClockPress?: () => void
}

/** why: each copy is turned to face the players on its side of the table, only the last is read out, and the line ticks on its own so the seats never re-render with the clock. */
export function BoardContextLabels({
  match,
  clock,
  system,
  placements,
  onClockPress,
}: BoardContextLabelsProps) {
  const view = useRoundClockView(clock, system)
  const paused = clock?.pausedAt !== undefined
  const pointerEvents = onClockPress ? "box-none" : "none"
  return (
    <>
      {placements.map(({ turn, ...frame }, index) => {
        const hidden = index < placements.length - 1
        return (
          <View
            key={turn}
            pointerEvents={pointerEvents}
            style={[$layer, frame, { transform: [{ rotate: `${turn}deg` }] }]}
            accessibilityElementsHidden={hidden}
            importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
            aria-hidden={hidden}
          >
            <ContextLine
              testID={hidden ? "match-context-top" : "match-context"}
              hidden={hidden}
              match={match}
              view={view}
              paused={paused}
              onPress={onClockPress}
            />
          </View>
        )
      })}
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
      {match && view ? separator("common:separator") : null}
      {view?.kind === "time" ? (
        <Text size="xxs" weight="semiBold" style={themed($text)} tx="board:clock.time" />
      ) : null}
      {view?.kind === "time" && clockText ? separator("common:separator") : null}
      {clockText ? (
        <Text size="xxs" weight={urgent ? "semiBold" : "medium"} style={themed($text)}>
          {clockText}
        </Text>
      ) : null}
      {paused ? separator("common:separator") + translate("board:clock.paused") : null}
    </Text>
  )
  if (!onPress) return line
  return (
    <BoardPressable
      testID={`${testID}-button`}
      accessibilityRole="button"
      accessibilityHint={translate("board:clock.opensRoundClock")}
      accessible={!hidden}
      focusable={!hidden}
      hitSlop={12}
      onPress={onPress}
    >
      {line}
    </BoardPressable>
  )
}

function clockLabel(view: RoundClockView, text: string, paused: boolean) {
  if (view.kind === "remaining")
    return translate(paused ? "board:clock.leftPaused" : "board:clock.left", { time: text })
  if (view.kind === "elapsed")
    return translate(paused ? "board:clock.elapsedPaused" : "board:clock.elapsed", { time: text })
  return text ? translate("board:clock.timeWith", { time: text }) : translate("board:clock.time")
}

// why: the line is anchored at its foot, so larger text grows away from the identity row.
const $layer: ViewStyle = {
  position: "absolute",
  height: LINE_HEIGHT,
  zIndex: 60,
  elevation: 60,
  alignItems: "center",
  justifyContent: "flex-end",
}
const $text: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.board.text })
const $line: ThemedStyle<TextStyle> = () => ({ opacity: 0.8 })
