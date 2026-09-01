import { useState } from "react"
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native"
import { useWindowDimensions, View } from "react-native"

import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { GamePlayer, LifeDelta, PlayerId } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { commanderBoardSeats } from "./commanderDamageLayout"
import { LifeCard, type LifeCardCommanderDamage } from "./LifeCard"
import {
  COMPACT_LIFE_TARGET_SIZE,
  getLifeFontSizeThatFits,
  getLifeTargetTextSpace,
  LIFE_TARGET_SIZE,
  type LifeCardContentRotation,
} from "./playerCardTypes"

export interface CommanderDamageGridBinding {
  incomingFor: (player: GamePlayer) => Record<PlayerId, number>
  armedPlayerId: PlayerId | null
  /**
   * Only set when assignment and confirmation live on separate devices. Local
   * play has nobody to confirm to, so each step applies as it is pressed and
   * there is nothing to stage or send.
   */
  staging?: {
    stagedFor: (player: GamePlayer) => number
    stagedTargets: number
    onSend: () => void
    onCancel: () => void
  }
  pendingFor?: (player: GamePlayer) => LifeCardCommanderDamage["pendingClaims"]
  onPressSword: (player: GamePlayer) => void
  onStage: (player: GamePlayer, step: number) => void
}

export interface PlayerGridProps {
  players: GamePlayer[]
  system?: PlaySystemId
  layoutVariant?: PlayerGridLayoutVariant
  disabled?: boolean
  isPlayerDisabled?: (player: GamePlayer) => boolean
  isPlayerOwned?: (player: GamePlayer) => boolean
  getPendingCount?: (player: GamePlayer) => number
  isPlayerEliminated?: (player: GamePlayer) => boolean
  commanderDamage?: CommanderDamageGridBinding
  onChange: (playerId: PlayerId, delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

const SINGLE_PLAYER_ROW_FLEX = 0.8

export function PlayerGrid({
  players,
  system = "mtg",
  layoutVariant = "auto",
  disabled,
  isPlayerDisabled,
  isPlayerOwned,
  getPendingCount,
  isPlayerEliminated,
  commanderDamage,
  onChange,
  style,
}: PlayerGridProps) {
  const { width, height, fontScale } = useWindowDimensions()
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const [board, setBoard] = useState({ width: 0, height: 0 })
  const counter = playSystemRules(system).counter
  const layout = getPlayerGridLayout({
    playerCount: players.length,
    width,
    height,
    fontScale,
    layoutVariant,
  })
  const lifeFontSize = getLifeFontSize({
    ...getCellSize({ board, layout, gap: spacing.xxs }),
    digits: Math.max(...players.map((player) => String(player.life).length)),
    fontScale,
    targetSize: layout.compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE,
  })

  function measureBoard(event: LayoutChangeEvent) {
    const { width: boardWidth, height: boardHeight } = event.nativeEvent.layout
    setBoard((current) =>
      current.width === boardWidth && current.height === boardHeight
        ? current
        : { width: boardWidth, height: boardHeight },
    )
  }

  const rows = getPlayerGridRows(players.length, layout)
  const boardSeats = commanderDamage
    ? commanderBoardSeats(
        rows,
        players.map(({ id }) => id),
      )
    : null

  return (
    <View
      testID="player-grid"
      accessibilityLabel={`${players.length} player ${counter.label} grid`}
      onLayout={measureBoard}
      style={[themed($grid), style]}
    >
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          testID={`player-grid-row-${rowIndex}`}
          style={[
            themed($row),
            getPlayerGridRowFlex(row, layout.columnCount) < 1 && $singlePlayerRow,
          ]}
        >
          {row.map((index, columnIndex) => {
            if (index === null) {
              return (
                <View
                  key={`empty-${rowIndex}-${columnIndex}`}
                  testID={`player-grid-empty-${rowIndex}-${columnIndex}`}
                  style={themed($cell)}
                />
              )
            }
            const player = players[index]
            const seatNumber = index + 1
            const playerDisabled = Boolean(isPlayerDisabled?.(player))
            const playerOwned = Boolean(isPlayerOwned?.(player))
            const contentRotation = getPlayerContentRotation({
              playerCount: players.length,
              layout,
              row,
              rowIndex,
              columnIndex,
              playerIndex: index,
            })
            const ownership = isPlayerOwned
              ? playerOwned
                ? "owned"
                : "unowned"
              : disabled
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
                  shape={player.shape}
                  life={player.life}
                  color={player.color}
                  compact={layout.compact}
                  contentRotation={contentRotation}
                  lifeFontSize={lifeFontSize}
                  system={system}
                  disabled={disabled || playerDisabled}
                  ownership={ownership}
                  pendingCount={getPendingCount?.(player)}
                  eliminated={isPlayerEliminated?.(player)}
                  commanderDamage={
                    commanderDamage && boardSeats
                      ? {
                          ownerPlayerId: player.id,
                          seats: boardSeats.seats,
                          rows: boardSeats.rows,
                          columns: boardSeats.columns,
                          incoming: commanderDamage.incomingFor(player),
                          armedPlayerId: commanderDamage.armedPlayerId,
                          stagedAgainstOwner: commanderDamage.staging?.stagedFor(player) ?? 0,
                          pendingClaims: commanderDamage.pendingFor?.(player),
                          onPressSword: () => commanderDamage.onPressSword(player),
                          onStage: (step) => commanderDamage.onStage(player, step),
                          ...(commanderDamage.staging && commanderDamage.armedPlayerId === player.id
                            ? {
                                armBar: {
                                  stagedTargets: commanderDamage.staging.stagedTargets,
                                  onSend: commanderDamage.staging.onSend,
                                  onCancel: commanderDamage.staging.onCancel,
                                },
                              }
                            : {}),
                        }
                      : undefined
                  }
                  onChange={(delta) => onChange(player.id, delta)}
                  style={getScreenCornerSquaringStyle({ rows, rowIndex, columnIndex })}
                />
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

export type PlayerGridLayoutVariant = "auto" | "featured-first" | "featured-last" | "even-grid"

export interface PlayerGridLayoutOption {
  variant: PlayerGridLayoutVariant
  label: string
}

export function getPlayerGridLayoutOptions(playerCount: number): PlayerGridLayoutOption[] {
  if (playerCount === 2) return [{ variant: "auto", label: "Responsive" }]
  if (playerCount % 2 === 0) return [{ variant: "auto", label: "Balanced" }]
  return playerCount === 3
    ? [
        { variant: "auto", label: "Top focus" },
        { variant: "featured-last", label: "Bottom focus" },
        { variant: "even-grid", label: "Even grid" },
      ]
    : [
        { variant: "auto", label: "Bottom focus" },
        { variant: "featured-first", label: "Top focus" },
        { variant: "even-grid", label: "Even grid" },
      ]
}

const LIFE_CONTROL_GUTTER = 40
const LIFE_HEIGHT_RATIO = 0.24

export function getCellSize(input: {
  board: { width: number; height: number }
  layout: ReturnType<typeof getPlayerGridLayout>
  gap: number
}) {
  const { board, layout, gap } = input
  const rowGaps = gap * (layout.rowCount - 1)
  const columnGaps = gap * (layout.columnCount - 1)
  return {
    cellWidth: (board.width - columnGaps) / layout.columnCount,
    cellHeight: (board.height - rowGaps) / layout.rowCount,
  }
}

export function getLifeFontSize(input: {
  cellWidth: number
  cellHeight: number
  digits: number
  fontScale: number
  targetSize: number
}): number | undefined {
  if (!(input.cellWidth > 0) || !(input.cellHeight > 0)) return undefined
  const targetSpace = getLifeTargetTextSpace(input.targetSize)
  return getLifeFontSizeThatFits({
    availableWidth: Math.max(Math.min(input.cellWidth - LIFE_CONTROL_GUTTER * 2, targetSpace), 1),
    availableHeight: Math.max(Math.min(input.cellHeight * LIFE_HEIGHT_RATIO, targetSpace), 1),
    digits: input.digits,
    fontScale: input.fontScale,
  })
}

export function getPlayerGridRows(
  playerCount: number,
  layout: ReturnType<typeof getPlayerGridLayout>,
): (number | null)[][] {
  const seats = Array.from({ length: playerCount }, (_, index) => index)
  if (layout.variant === "featured-first") return [[0], ...chunkSeats(seats.slice(1), 2)]
  if (layout.variant === "featured-last")
    return [...chunkSeats(seats.slice(0, -1), 2), [playerCount - 1]]
  if (layout.variant === "even-grid") return chunkSeats(seats, 2, true)
  if (layout.layout === "three-featured") return [[0], [1, 2]]
  return chunkSeats(seats, layout.columnCount)
}

export function getPlayerGridMenuAnchor(
  playerCount: number,
  layout: ReturnType<typeof getPlayerGridLayout>,
): { x: number; y: number } {
  const rows = getPlayerGridRows(playerCount, layout)
  const rowFlexes = rows.map((row) => getPlayerGridRowFlex(row, layout.columnCount))
  const totalRowFlex = rowFlexes.reduce((total, flex) => total + flex, 0)
  let cumulativeFlex = 0
  const boundaryPositions = rowFlexes.slice(0, -1).map((flex) => {
    cumulativeFlex += flex
    return cumulativeFlex / totalRowFlex
  })
  for (let boundary = rows.length - 1; boundary > 0; boundary -= 1) {
    const upper = rows[boundary - 1]
    const lower = rows[boundary]
    const columnCount = Math.max(upper.length, lower.length)
    for (let column = columnCount - 1; column > 0; column -= 1) {
      const fourCardsMeet = [
        upper[column - 1],
        upper[column],
        lower[column - 1],
        lower[column],
      ].every((seat) => seat !== null && seat !== undefined)
      if (fourCardsMeet) return { x: column / columnCount, y: boundaryPositions[boundary - 1] }
    }
  }
  const nearestCentralBoundary = boundaryPositions.reduce<number | undefined>(
    (nearest, position) =>
      nearest === undefined || Math.abs(position - 0.5) < Math.abs(nearest - 0.5)
        ? position
        : nearest,
    undefined,
  )
  return { x: 0.5, y: nearestCentralBoundary ?? 0.5 }
}

function getPlayerGridRowFlex(row: (number | null)[], columnCount: number): number {
  return row.length === 1 && columnCount > 1 ? SINGLE_PLAYER_ROW_FLEX : 1
}

export function getScreenCornerSquaringStyle(input: {
  rows: (number | null)[][]
  rowIndex: number
  columnIndex: number
}): ViewStyle | undefined {
  const touchesTopEdge = input.rowIndex === 0
  const touchesBottomEdge = input.rowIndex === input.rows.length - 1
  const touchesLeftEdge = input.columnIndex === 0
  const touchesRightEdge = input.columnIndex === input.rows[input.rowIndex].length - 1
  const squared: ViewStyle = {
    ...(touchesTopEdge && touchesLeftEdge ? { borderTopLeftRadius: 0 } : null),
    ...(touchesTopEdge && touchesRightEdge ? { borderTopRightRadius: 0 } : null),
    ...(touchesBottomEdge && touchesLeftEdge ? { borderBottomLeftRadius: 0 } : null),
    ...(touchesBottomEdge && touchesRightEdge ? { borderBottomRightRadius: 0 } : null),
  }
  return Object.keys(squared).length ? squared : undefined
}

export function getPlayerContentRotation(input: {
  playerCount: number
  layout: ReturnType<typeof getPlayerGridLayout>
  row: (number | null)[]
  rowIndex: number
  columnIndex: number
  playerIndex: number
}): LifeCardContentRotation {
  if (input.playerCount === 2 && input.layout.layout === "two-stacked")
    return input.playerIndex === 0 ? 180 : 0

  const occupiedColumns = input.row.flatMap((seat, column) => (seat === null ? [] : [column]))
  if (occupiedColumns.length === 1) return input.rowIndex < input.layout.rowCount / 2 ? 180 : 0
  if (input.columnIndex === occupiedColumns[0]) return 90
  if (input.columnIndex === occupiedColumns[occupiedColumns.length - 1]) return -90
  return input.rowIndex < input.layout.rowCount / 2 ? 180 : 0
}

function chunkSeats(
  seats: number[],
  columnCount: number,
  fillLastRow = false,
): (number | null)[][] {
  const rows: (number | null)[][] = []
  for (let index = 0; index < seats.length; index += columnCount) {
    const row: (number | null)[] = seats.slice(index, index + columnCount)
    if (fillLastRow) {
      while (row.length < columnCount) row.push(null)
    }
    rows.push(row)
  }
  return rows
}

const $grid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  width: "100%",
  gap: spacing.xxs,
  paddingHorizontal: 0,
  paddingBottom: 0,
})

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  gap: spacing.xxs,
})

const $singlePlayerRow: ViewStyle = { flex: SINGLE_PLAYER_ROW_FLEX }

const $cell: ThemedStyle<ViewStyle> = () => ({ flex: 1 })

export function getPlayerGridLayout(input: {
  playerCount: number
  width: number
  height: number
  fontScale?: number
  layoutVariant?: PlayerGridLayoutVariant
}) {
  const landscape = input.width > input.height
  const tablet = Math.min(input.width, input.height) >= 600
  const largeText = (input.fontScale ?? 1) >= 1.4
  const automaticColumnCount =
    input.playerCount === 2
      ? landscape
        ? 2
        : 1
      : input.playerCount === 3 && landscape
        ? 3
        : input.playerCount >= 5 && landscape
          ? 3
          : 2
  const variant = input.layoutVariant ?? "auto"
  const columnCount =
    variant === "featured-first" || variant === "featured-last" || variant === "even-grid"
      ? 2
      : automaticColumnCount
  const rowCount =
    variant === "featured-first" || variant === "featured-last"
      ? 1 + Math.ceil((input.playerCount - 1) / 2)
      : variant === "even-grid"
        ? Math.ceil(input.playerCount / 2)
        : input.playerCount === 3 && !landscape
          ? 2
          : Math.ceil(input.playerCount / columnCount)
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
    variant,
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
