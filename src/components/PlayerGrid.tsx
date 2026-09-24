import { useState } from "react"
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native"
import { useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import {
  playerGridLayoutForCount,
  type PlayerGridLayoutVariant,
} from "@/features/game/playerLayouts"
import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { GamePlayer, LifeDelta, PlayerId } from "@/features/game/types"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { commanderBoardSeats } from "./commanderDamageLayout"
import { LifeCard, type LifeCardCommanderDamage } from "./LifeCard"
import {
  COMPACT_LIFE_GLYPH_LINE_HEIGHT,
  COMPACT_LIFE_TARGET_SIZE,
  getLifeFontSizeThatFits,
  getLifeTargetTextSpace,
  LIFE_GLYPH_LINE_HEIGHT,
  LIFE_TARGET_SIZE,
  type LifeCardContentRotation,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "./playerCardTypes"

export interface CommanderDamageGridBinding {
  incomingFor: (player: GamePlayer) => Record<PlayerId, number>
  armedPlayerId: PlayerId | null
  inspection?: { playerId: PlayerId | null; onChange: (playerId: PlayerId | null) => void }
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
  lifeStep?: number
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
  system,
  lifeStep,
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
  const insets = useSafeAreaInsets()
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
  const cellSize = getCellSize({ board, layout, gap: spacing.xxs })
  const lifeFontSizeInput = {
    ...cellSize,
    fontScale,
    targetSize: layout.compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE,
    sidewaysGlyphReserve:
      2 * ((layout.compact ? COMPACT_LIFE_GLYPH_LINE_HEIGHT : LIFE_GLYPH_LINE_HEIGHT) + spacing.xs),
  }

  function measureBoard(event: LayoutChangeEvent) {
    const { width: boardWidth, height: boardHeight } = event.nativeEvent.layout
    setBoard((current) =>
      current.width === boardWidth && current.height === boardHeight
        ? current
        : { width: boardWidth, height: boardHeight },
    )
  }

  const rows = getPlayerGridRows(players.length, layout)
  const menuJunction = getFourCardMenuJunction(rows)
  const fallbackMenuBoundary = menuJunction ? null : getCentralMenuBoundary(rows, layout)
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
      style={[
        themed($grid),
        style,
        (cellSize.cellWidth <= 0 || cellSize.cellHeight <= 0) && $unmeasured,
      ]}
    >
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          testID={`player-grid-row-${rowIndex}`}
          style={[themed($row), { flex: getPlayerGridRowFlex(row, layout) }]}
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
            const contentInsets = {
              top: rowIndex === 0 ? insets.top : 0,
              bottom: rowIndex === rows.length - 1 ? insets.bottom : 0,
              left: columnIndex === 0 ? insets.left : 0,
              right: columnIndex === row.length - 1 ? insets.right : 0,
            }
            const fallbackMenu =
              fallbackMenuBoundary === null
                ? undefined
                : fallbackMenuAt(rows, fallbackMenuBoundary, rowIndex, columnIndex)
            const menuCorner =
              menuCornerAt(menuJunction, rowIndex, columnIndex) ?? fallbackMenu?.corner
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
                  contentInsets={contentInsets}
                  menuCorner={menuCorner}
                  menuEdgeCenter={fallbackMenu?.edgeCenter}
                  lifeFontSize={getLifeFontSize({
                    ...lifeFontSizeInput,
                    digits: String(player.life).length,
                  })}
                  system={system}
                  lifeStep={lifeStep}
                  disabled={disabled || playerDisabled}
                  ownership={ownership}
                  pendingCount={getPendingCount?.(player)}
                  eliminated={isPlayerEliminated?.(player)}
                  commanderDamage={
                    commanderDamage && boardSeats
                      ? {
                          ownerPlayerId: player.id,
                          players: commanderDamage.inspection ? players : undefined,
                          inspection: commanderDamage.inspection
                            ? {
                                open: commanderDamage.inspection.playerId === player.id,
                                onToggle: () =>
                                  commanderDamage.inspection?.onChange(
                                    commanderDamage.inspection.playerId === player.id
                                      ? null
                                      : player.id,
                                  ),
                              }
                            : undefined,
                          seats: boardSeats.seats,
                          rows: boardSeats.rows,
                          columns: boardSeats.columns,
                          incoming: commanderDamage.incomingFor(player),
                          armedPlayerId: commanderDamage.armedPlayerId,
                          attackerName: commanderDamage.armedPlayerId
                            ? players.find(({ id }) => id === commanderDamage.armedPlayerId)?.name
                            : undefined,
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

export { getPlayerGridLayoutOptions } from "@/features/game/playerLayouts"
export type { PlayerGridLayoutVariant } from "@/features/game/playerLayouts"

const LIFE_CONTROL_GUTTER = 32
const LIFE_HEIGHT_RATIO = 0.5

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
  sidewaysGlyphReserve: number
}): number | undefined {
  if (!(input.cellWidth > 0) || !(input.cellHeight > 0)) return undefined
  const targetSpace = getLifeTargetTextSpace(input.targetSize)
  const fit = (availableWidth: number, availableHeight: number) =>
    getLifeFontSizeThatFits({
      availableWidth,
      availableHeight,
      digits: input.digits,
      fontScale: input.fontScale,
    })
  return Math.min(
    fit(
      Math.max(Math.min(input.cellWidth - LIFE_CONTROL_GUTTER * 2, targetSpace), 1),
      Math.max(Math.min(input.cellHeight * LIFE_HEIGHT_RATIO, targetSpace), 1),
    ),
    fit(
      Math.max(Math.min(input.cellHeight - input.sidewaysGlyphReserve, targetSpace), 1),
      Math.max(Math.min(input.cellWidth - LIFE_CONTROL_GUTTER * 2, targetSpace), 1),
    ),
  )
}

export function getPlayerGridRows(
  playerCount: number,
  layout: ReturnType<typeof getPlayerGridLayout>,
): (number | null)[][] {
  const seats = Array.from({ length: playerCount }, (_, index) => index)
  if (layout.variant === "tabletop")
    return [[0], ...chunkSeats(seats.slice(1, -1), 2), [playerCount - 1]]
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
  const rowFlexes = rows.map((row) => getPlayerGridRowFlex(row, layout))
  const totalRowFlex = rowFlexes.reduce((total, flex) => total + flex, 0)
  let cumulativeFlex = 0
  const boundaryPositions = rowFlexes.slice(0, -1).map((flex) => {
    cumulativeFlex += flex
    return cumulativeFlex / totalRowFlex
  })
  const junction = getFourCardMenuJunction(rows)
  if (junction)
    return {
      x: junction.column / junction.columnCount,
      y: boundaryPositions[junction.boundary - 1],
    }
  return { x: 0.5, y: boundaryPositions[getCentralMenuBoundary(rows, layout) - 1] ?? 0.5 }
}

function getCentralMenuBoundary(
  rows: (number | null)[][],
  layout: ReturnType<typeof getPlayerGridLayout>,
) {
  const flexes = rows.map((row) => getPlayerGridRowFlex(row, layout))
  const total = flexes.reduce((sum, flex) => sum + flex, 0)
  let position = 0
  let nearest = { boundary: 1, distance: Infinity }
  for (let index = 0; index < rows.length - 1; index += 1) {
    position += flexes[index] / total
    const distance = Math.abs(position - 0.5)
    if (distance < nearest.distance) nearest = { boundary: index + 1, distance }
  }
  return nearest.boundary
}

function getFourCardMenuJunction(rows: (number | null)[][]) {
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
      if (fourCardsMeet) return { boundary, column, columnCount }
    }
  }
  return null
}

function menuCornerAt(
  junction: ReturnType<typeof getFourCardMenuJunction>,
  row: number,
  column: number,
): LifeCardMenuCorner | undefined {
  if (!junction) return undefined
  if (row === junction.boundary - 1 && column === junction.column - 1) return "bottomRight"
  if (row === junction.boundary - 1 && column === junction.column) return "bottomLeft"
  if (row === junction.boundary && column === junction.column - 1) return "topRight"
  if (row === junction.boundary && column === junction.column) return "topLeft"
  return undefined
}

function fallbackMenuAt(
  rows: (number | null)[][],
  boundary: number,
  row: number,
  column: number,
): { corner?: LifeCardMenuCorner; edgeCenter?: LifeCardMenuEdge } | undefined {
  if (rows.length === 1 && rows[0].length === 2)
    return row === 0 ? { edgeCenter: column === 0 ? "right" : "left" } : undefined
  if (row !== boundary - 1 && row !== boundary) return undefined
  const upper = row === boundary - 1
  const count = rows[row].length
  const middle = Math.floor(count / 2)
  if (count % 2) return column === middle ? { edgeCenter: upper ? "bottom" : "top" } : undefined
  if (column === middle - 1) return { corner: upper ? "bottomRight" : "topRight" }
  if (column === middle) return { corner: upper ? "bottomLeft" : "topLeft" }
  return undefined
}

export function getPlayerGridRowFlex(
  row: (number | null)[],
  layout: ReturnType<typeof getPlayerGridLayout>,
): number {
  if (row.length !== 1 || layout.columnCount === 1) return 1
  return SINGLE_PLAYER_ROW_FLEX
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

const $cell: ThemedStyle<ViewStyle> = () => ({ flex: 1 })

const $unmeasured: ViewStyle = { opacity: 0 }

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
  const variant = playerGridLayoutForCount(input.playerCount, input.layoutVariant)
  const columnCount =
    variant === "featured-first" ||
    variant === "featured-last" ||
    variant === "even-grid" ||
    variant === "tabletop"
      ? 2
      : automaticColumnCount
  const rowCount =
    variant === "tabletop"
      ? 2 + Math.ceil((input.playerCount - 2) / 2)
      : variant === "featured-first" || variant === "featured-last"
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
