import { useState } from "react"
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native"
import { useWindowDimensions, View } from "react-native"

import type { GamePlayer, LifeDelta, PlayerId } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { LifeCard } from "./LifeCard"

export interface PlayerGridProps {
  players: GamePlayer[]
  disabled?: boolean
  isPlayerDisabled?: (player: GamePlayer) => boolean
  getPendingCount?: (player: GamePlayer) => number
  onChange: (playerId: PlayerId, delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

export function PlayerGrid({
  players,
  disabled,
  isPlayerDisabled,
  getPendingCount,
  onChange,
  style,
}: PlayerGridProps) {
  const { width, height, fontScale } = useWindowDimensions()
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const [board, setBoard] = useState({ width: 0, height: 0 })
  const layout = getPlayerGridLayout({
    playerCount: players.length,
    width,
    height,
    fontScale,
  })
  const lifeFontSize = getLifeFontSize({
    ...getCellSize({ board, layout, gap: spacing.xxs }),
    digits: Math.max(...players.map((player) => String(player.life).length)),
  })

  function measureBoard(event: LayoutChangeEvent) {
    const { width: boardWidth, height: boardHeight } = event.nativeEvent.layout
    setBoard((current) =>
      current.width === boardWidth && current.height === boardHeight
        ? current
        : { width: boardWidth, height: boardHeight },
    )
  }

  return (
    <View
      testID="player-grid"
      accessibilityLabel={`${players.length} player life grid`}
      onLayout={measureBoard}
      style={[themed($grid), style]}
    >
      {getPlayerGridRows(players.length, layout).map((row, rowIndex) => (
        <View key={rowIndex} style={themed($row)}>
          {row.map((index) => {
            const player = players[index]
            const seatNumber = index + 1
            const playerDisabled = Boolean(isPlayerDisabled?.(player))
            const ownership = disabled
              ? "disabled"
              : isPlayerDisabled
                ? playerDisabled
                  ? "unowned"
                  : "owned"
                : undefined
            return (
              <View key={player.id} testID={`player-cell-seat-${seatNumber}`} style={themed($cell)}>
                <LifeCard
                  playerName={player.name}
                  seatNumber={seatNumber}
                  life={player.life}
                  color={player.color}
                  compact={layout.compact}
                  lifeFontSize={lifeFontSize}
                  disabled={disabled || playerDisabled}
                  ownership={ownership}
                  pendingCount={getPendingCount?.(player)}
                  onChange={(delta) => onChange(player.id, delta)}
                />
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const SEAT_ONE_FEATURED_ROW = [0]
const REMAINING_SEATS_ROW = [1, 2]

const LIFE_CONTROL_GUTTER = 40
const LIFE_DIGIT_ASPECT = 0.62
const LIFE_HEIGHT_RATIO = 0.24
const LIFE_FONT_MIN = 22
const LIFE_FONT_MAX = 80

export function getCellSize(input: {
  board: { width: number; height: number }
  layout: ReturnType<typeof getPlayerGridLayout>
  gap: number
}) {
  const { board, layout, gap } = input
  const rowGaps = gap * (layout.rowCount - 1)
  const columnGaps = gap * (layout.columnCount - 1)
  return {
    cellWidth: (board.width - gap * 2 - columnGaps) / layout.columnCount,
    cellHeight: (board.height - gap - rowGaps) / layout.rowCount,
  }
}

export function getLifeFontSize(input: {
  cellWidth: number
  cellHeight: number
  digits: number
}): number | undefined {
  if (!(input.cellWidth > 0) || !(input.cellHeight > 0)) return undefined
  const usableWidth = Math.max(input.cellWidth - LIFE_CONTROL_GUTTER * 2, 24)
  const byWidth = usableWidth / (Math.max(input.digits, 2) * LIFE_DIGIT_ASPECT)
  const byHeight = input.cellHeight * LIFE_HEIGHT_RATIO
  return Math.max(LIFE_FONT_MIN, Math.min(LIFE_FONT_MAX, Math.floor(Math.min(byWidth, byHeight))))
}

export function getPlayerGridRows(
  playerCount: number,
  layout: ReturnType<typeof getPlayerGridLayout>,
): number[][] {
  if (layout.layout === "three-featured") return [SEAT_ONE_FEATURED_ROW, REMAINING_SEATS_ROW]
  const rows: number[][] = []
  for (let index = 0; index < playerCount; index += layout.columnCount) {
    rows.push(
      Array.from(
        { length: Math.min(layout.columnCount, playerCount - index) },
        (_, offset) => index + offset,
      ),
    )
  }
  return rows
}

const $grid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  width: "100%",
  gap: spacing.xxs,
  paddingHorizontal: spacing.xxs,
  paddingBottom: spacing.xxs,
})

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  gap: spacing.xxs,
})

const $cell: ThemedStyle<ViewStyle> = () => ({ flex: 1 })

export function getPlayerGridLayout(input: {
  playerCount: number
  width: number
  height: number
  fontScale?: number
}) {
  const landscape = input.width > input.height
  const tablet = Math.min(input.width, input.height) >= 600
  const largeText = (input.fontScale ?? 1) >= 1.4
  const columnCount =
    input.playerCount === 2
      ? landscape
        ? 2
        : 1
      : input.playerCount === 3 && landscape
        ? 3
        : input.playerCount >= 5 && landscape
          ? 3
          : 2
  const rowCount =
    input.playerCount === 3 && !landscape ? 2 : Math.ceil(input.playerCount / columnCount)
  const layout =
    input.playerCount === 2
      ? landscape
        ? "two-side-by-side"
        : "two-stacked"
      : input.playerCount === 3
        ? landscape
          ? "three-tabletop"
          : "three-featured"
        : input.playerCount === 4
          ? "four-grid"
          : landscape
            ? "dense-landscape"
            : "dense-portrait"
  const availableHeight = Math.max(input.height - 132, 300)
  const baseCellHeight = Math.max(148, Math.floor(availableHeight / rowCount))
  const minCellHeight = largeText ? Math.ceil(baseCellHeight * 1.25) : baseCellHeight
  return {
    columnCount,
    rowCount,
    layout,
    minCellHeight,
    compact: input.playerCount >= 5 || baseCellHeight < 280,
    landscape,
    tablet,
    largeText,
  }
}
