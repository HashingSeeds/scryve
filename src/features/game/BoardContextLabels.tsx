import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { BoardPressable } from "@/components/BoardPressable"
import { lifeInk } from "@/components/commanderDamageLayout"
import { seatBagSize } from "@/components/CounterChips"
import { MENU_BUTTON_SIZE } from "@/components/GameRadialMenu"
import { seatIdentityPlacement } from "@/components/LifeCard"
import {
  COMPACT_LIFE_GLYPH_LINE_HEIGHT,
  COMPACT_LIFE_TARGET_SIZE,
  cornerOffset,
  LIFE_GLYPH_LINE_HEIGHT,
  LIFE_MAX_FONT_SCALE,
  LIFE_TARGET_SIZE,
  type LifeCardContentRotation,
} from "@/components/playerCardTypes"
import { getCellSize, getLifeFontSize } from "@/components/PlayerGrid"
import {
  CONTENT_EDGES,
  EDGE_TAB,
  getPlayerGridRowFlex,
  getPlayerGridRows,
  seatFrames,
} from "@/components/playerGridGeometry"
import { MENU_CLEARANCE } from "@/components/pokemon/pokemonCardLayout"
import { seatIdentityBottomGap, seatIdentityMetrics } from "@/components/SeatIdentity"
import { panelBoxes, teamPanelCompact } from "@/components/teamGridGeometry"
import { Text } from "@/components/Text"
import { separator } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { spacing } from "@/theme/spacing"
import type { ThemedStyle } from "@/theme/types"

import type { PlaySystemId } from "./playSystems"
import { roundClockText, type RoundClock, type RoundClockView } from "./roundClock"
import { useRoundClockView } from "./useRoundClockView"

const WARN_MS = 5 * 60_000

const LINE_HEIGHT = 18
const IDENTITY_CLEARANCE = 4
const TOP_GAP = 6
const TURNS: readonly LifeCardContentRotation[] = [0, 90, 180, -90]

type SeatRows = ReturnType<typeof seatFrames>["rows"]
type Seat = NonNullable<SeatRows[number][number]>
type Point = { x: number; y: number }
type Spot = { along: number; up: number; width: number }

interface LabelInput {
  rows: SeatRows
  board: { width: number; height: number }
  screen?: { width: number; height: number }
  rotation?: number
  compact?: boolean
  benchSeats?: boolean
  teamBoard?: boolean
  fontScale?: number
  lifeFontSize?: (slot: number) => number | undefined
}

export type ContextLabelPlacement = ReturnType<typeof contextLabelPlacements>[number]

function turned({ x, y }: Point, degrees: number): Point {
  const turn = (degrees * Math.PI) / 180
  const cos = Math.round(Math.cos(turn))
  const sin = Math.round(Math.sin(turn))
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

/** why: a seat's free strip depends on what it draws, so each kind of seat lists its strips in order and the line takes the first one the life total leaves clear; a seat with none draws no copy, as the menu's status line carries the score too. LifeControls centres the total on the card, not inside its insets, and its ink grows with the text size. The line's own text grows up from its foot. Measured in the seat's own upright frame: `along` from its left, `up` from its foot. */
function seatSpot(
  seat: Seat,
  {
    compact,
    benchSeats,
    teamBoard,
    fontScale = 1,
    lifeFontSize,
  }: Pick<LabelInput, "compact" | "benchSeats" | "teamBoard" | "fontScale" | "lifeFontSize">,
): Spot | undefined {
  const { card, rotation, contentInsets, screenEdges } = seat
  const sideways = Math.abs(rotation) === 90
  const run = sideways ? card.height : card.width
  const rise = sideways ? card.width : card.height
  const edges = CONTENT_EDGES[rotation]
  const menuOnTop = seat.menuEdgeCenter === edges.top
  const line = LINE_HEIGHT * Math.max(fontScale, 1)
  const lifeScale = Math.min(fontScale, LIFE_MAX_FONT_SCALE)
  const ink = lifeInk(lifeFontSize?.(seat.slot) ?? 0, 2)
  const life = {
    foot: rise / 2 - (ink.y + ink.height / 2) * lifeScale,
    head: rise / 2 - (ink.y - ink.height / 2) * lifeScale,
    halfWidth: (ink.width / 2) * lifeScale,
  }
  const centred = (foot: number) => ({ along: run / 2, up: foot + LINE_HEIGHT / 2, width: run })
  const belowTotal = (foot: number) => (foot + line <= life.foot ? centred(foot) : undefined)
  const aboveTotal = (depth: number) =>
    rise - depth - line >= life.head ? centred(rise - depth - line) : undefined
  const metrics = seatIdentityMetrics(compact)

  if (teamBoard) {
    // why: a team card draws its two names along its top edge out from both corners, as far as the middle, and its counters and bags along its foot, so neither edge strip nor the strip beside the menu is ever clear; only the bands between those rows and the total are.
    const names =
      Math.max(
        ...(["left", "right"] as const).map((side) =>
          cornerOffset(metrics.gap, edges.top, edges[side], contentInsets, screenEdges),
        ),
      ) + metrics.icon
    const menu = menuOnTop ? MENU_BUTTON_SIZE / 2 : 0
    const inset = contentInsets[edges.bottom]
    const row = seatIdentityBottomGap(metrics.edge, inset) + inset
    return (
      aboveTotal(
        Math.max(names + IDENTITY_CLEARANCE, menu + IDENTITY_CLEARANCE, contentInsets[edges.top]),
      ) ?? belowTotal(row + (metrics.icon + seatBagSize(compact)) / 2 + IDENTITY_CLEARANCE)
    )
  }

  const identity = seatIdentityPlacement({
    rotation,
    cardSize: card,
    gap: metrics.edge,
    insets: contentInsets,
    screenEdges,
    markHeight: metrics.icon,
    buttonSize: metrics.icon,
  })
  const aboveIdentity = () =>
    belowTotal(Number(identity.position.bottom) + metrics.icon + IDENTITY_CLEARANCE)
  if (!menuOnTop)
    return benchSeats
      ? undefined
      : (aboveTotal(contentInsets[edges.top] + TOP_GAP - (line - LINE_HEIGHT)) ?? aboveIdentity())
  const start = Math.max(EDGE_TAB.depth, contentInsets[edges.left])
  const end = run / 2 - MENU_CLEARANCE
  const beside =
    end > start
      ? { along: (start + end) / 2, up: rise - MENU_CLEARANCE / 2, width: end - start }
      : undefined
  // why: a bench seat is full from its identity row to its top edge and draws no total, so the strip it keeps clear beside the menu is its only free one.
  if (benchSeats) return beside
  const totalReachesStrip =
    life.halfWidth > MENU_CLEARANCE && life.head > rise - MENU_CLEARANCE / 2 - LINE_HEIGHT / 2
  return aboveIdentity() ?? (totalReachesStrip ? undefined : beside)
}

/** why: a line centred on a whole screen edge crossed the dividers of a board with more than two seats and drew over a bench, so each copy sits inside one seat, turned to face it. One copy per facing is enough to read from every side; it goes in the seat nearest the middle of the table. `rotation` turns a board drawn sideways onto the screen. */
function contextLabelPlacements({
  rows,
  board,
  screen = board,
  rotation = 0,
  ...seatInput
}: LabelInput) {
  const nearest = new Map<LifeCardContentRotation, { center: Point; width: number; far: number }>()
  for (const seat of rows.flat()) {
    const spot = seat && seatSpot(seat, seatInput)
    if (!spot) continue
    const { card } = seat
    const sideways = Math.abs(seat.rotation) === 90
    const middle = { x: card.x + card.width / 2, y: card.y + card.height / 2 }
    const offset = turned(
      {
        x: spot.along - (sideways ? card.height : card.width) / 2,
        y: (sideways ? card.width : card.height) / 2 - spot.up,
      },
      seat.rotation,
    )
    const far = Math.hypot(middle.x - board.width / 2, middle.y - board.height / 2)
    const current = nearest.get(seat.rotation)
    if (current && far > current.far - 0.5) continue
    nearest.set(seat.rotation, {
      center: { x: middle.x + offset.x, y: middle.y + offset.y },
      width: spot.width,
      far,
    })
  }
  return [...nearest].map(([facing, { center, width }]) => {
    const onScreen = turned(
      { x: center.x - board.width / 2, y: center.y - board.height / 2 },
      rotation,
    )
    return {
      left: screen.width / 2 + onScreen.x - width / 2,
      top: screen.height / 2 + onScreen.y - LINE_HEIGHT / 2,
      width,
      turn: TURNS[((((facing + rotation) / 90) % 4) + 4) % 4],
    }
  })
}

/** why: the label is placed from the same seat frames the grid draws, so it follows each seat's insets, tabs, and menu corner, and from the total PlayerGrid sizes: two digits are the largest it draws, sized to the grid's cell, or to a team's own panel. */
export function boardLabelPlacements({
  playerCount,
  teamBoard,
  layout,
  width,
  height,
  screen,
  rotation,
  topEdgeBand = 0,
  fontScale,
  insets,
  tabsShown,
  benchSeats,
}: {
  playerCount: number
  teamBoard?: boolean
  layout: Parameters<typeof seatFrames>[0]["layout"]
  width: number
  height: number
  screen?: { width: number; height: number }
  rotation?: number
  topEdgeBand?: number
  fontScale: number
  insets: Parameters<typeof seatFrames>[0]["insets"]
  tabsShown: boolean
  benchSeats?: boolean
}) {
  const board = { width, height }
  const { rows } = seatFrames({
    playerCount,
    layout,
    boardSize: board,
    measuredGrid: board,
    topEdgeBand,
    gap: spacing.xxs,
    insets,
    tabsShown,
  })
  const compact = teamBoard ? teamPanelCompact(layout, playerCount) : layout.compact
  const glyphLine = compact ? COMPACT_LIFE_GLYPH_LINE_HEIGHT : LIFE_GLYPH_LINE_HEIGHT
  const grid = { width, height: height - topEdgeBand }
  const cell = getCellSize({ board: grid, layout, gap: spacing.xxs })
  const slots = getPlayerGridRows(playerCount, layout)
  const panels = teamBoard
    ? panelBoxes(
        slots,
        slots.map((row) => getPlayerGridRowFlex(row, layout)),
      )
    : undefined
  return contextLabelPlacements({
    rows,
    board,
    screen,
    rotation,
    compact,
    benchSeats,
    teamBoard,
    fontScale,
    lifeFontSize: (slot) => {
      const panel = panels?.get(slot)
      return getLifeFontSize({
        ...(panel
          ? {
              cellWidth: (panel.x1 - panel.x0) * grid.width,
              cellHeight: (panel.y1 - panel.y0) * grid.height,
            }
          : cell),
        digits: 2,
        fontScale,
        targetSize: compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE,
        sidewaysGlyphReserve: 2 * (glyphLine + spacing.xs),
      })
    },
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
      numberOfLines={1}
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
