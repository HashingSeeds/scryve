import { useState } from "react"
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native"
import { useWindowDimensions, View } from "react-native"
import Animated, { useAnimatedStyle } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { type PlayerGridLayoutVariant } from "@/features/game/playerLayouts"
import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { GamePlayer, LifeDelta, PlayerId } from "@/features/game/types"
import type { useGameBoardOrientation } from "@/features/game/useGameBoardOrientation"
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
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "./playerCardTypes"
import {
  getCentralMenuBoundary,
  getFourCardMenuJunction,
  getPlayerContentRotation,
  getPlayerGridLayout,
  getPlayerGridRowFlex,
  getPlayerGridRows,
} from "./playerGridGeometry"

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
  boardOrientation?: Omit<ReturnType<typeof useGameBoardOrientation>, "frameRef" | "nativeFrame"> &
    Partial<Pick<ReturnType<typeof useGameBoardOrientation>, "nativeFrame">>
  system?: PlaySystemId
  lifeStep?: number
  layoutVariant?: PlayerGridLayoutVariant
  disabled?: boolean
  isPlayerDisabled?: (player: GamePlayer) => boolean
  isPlayerOwned?: (player: GamePlayer) => boolean
  getStaleSince?: (player: GamePlayer) => number | undefined
  isPlayerEliminated?: (player: GamePlayer) => boolean
  commanderDamage?: CommanderDamageGridBinding
  onChange: (playerId: PlayerId, delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

export function PlayerGrid({
  players,
  boardOrientation,
  system,
  lifeStep,
  layoutVariant = "auto",
  disabled,
  isPlayerDisabled,
  isPlayerOwned,
  getStaleSince,
  isPlayerEliminated,
  commanderDamage,
  onChange,
  style,
}: PlayerGridProps) {
  const dimensions = useWindowDimensions()
  const boardRotation = boardOrientation?.rotation ?? 0
  const { width, height, fontScale } = boardOrientation ?? dimensions
  const nativeFrame = boardOrientation?.nativeFrame
  const nativeBoardStyle = useAnimatedStyle(() => {
    if (!boardOrientation) return {}
    const frame = nativeFrame?.value ?? {
      width: boardOrientation.screenWidth,
      height: boardOrientation.screenHeight,
      rotation: boardRotation,
    }
    const width = Math.min(frame.width, frame.height)
    const height = Math.max(frame.width, frame.height)
    return {
      width,
      height,
      left: (frame.width - width) / 2,
      top: (frame.height - height) / 2,
      transform: [{ rotate: `${frame.rotation}deg` }],
    }
  })
  const screenInsets = useSafeAreaInsets()
  const insets =
    boardRotation === 90
      ? {
          top: screenInsets.right,
          right: screenInsets.bottom,
          bottom: screenInsets.left,
          left: screenInsets.top,
        }
      : boardRotation === -90
        ? {
            top: screenInsets.left,
            right: screenInsets.top,
            bottom: screenInsets.right,
            left: screenInsets.bottom,
          }
        : screenInsets
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
  const armedPlayer = players.find(({ id }) => id === commanderDamage?.armedPlayerId)

  return (
    <View testID="player-grid-frame" style={$frame}>
      <Animated.View
        testID="player-grid"
        accessibilityLabel={`${players.length} player ${counter.label} grid`}
        onLayout={measureBoard}
        style={[
          themed($grid),
          style,
          boardOrientation && $fixedGrid,
          boardOrientation && {
            width,
            height,
            transform: [
              { translateX: -width / 2 },
              { translateY: -height / 2 },
              { rotate: `${boardRotation}deg` },
            ],
          },
          nativeBoardStyle,
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
              const screenEdges = {
                top: rowIndex === 0,
                bottom: rowIndex === rows.length - 1,
                left: columnIndex === 0,
                right: columnIndex === row.length - 1,
              }
              const contentInsets = {
                top: screenEdges.top ? insets.top : 0,
                bottom: screenEdges.bottom ? insets.bottom : 0,
                left: screenEdges.left ? insets.left : 0,
                right: screenEdges.right ? insets.right : 0,
              }
              const fallbackMenu =
                fallbackMenuBoundary === null
                  ? undefined
                  : fallbackMenuAt(rows, fallbackMenuBoundary, rowIndex, columnIndex)
              const menuCorner =
                menuCornerAt(menuJunction, rowIndex, columnIndex) ?? fallbackMenu?.corner
              return (
                <View
                  key={player.id}
                  testID={`player-cell-seat-${seatNumber}`}
                  style={themed($cell)}
                >
                  <LifeCard
                    playerName={player.name}
                    seatNumber={seatNumber}
                    shape={player.shape}
                    life={player.life}
                    color={player.color}
                    compact={layout.compact}
                    contentRotation={contentRotation}
                    boardRotation={boardRotation}
                    contentInsets={contentInsets}
                    screenEdges={screenEdges}
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
                    staleSince={getStaleSince?.(player)}
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
                            attackerName: armedPlayer?.name,
                            attacker: armedPlayer && {
                              color: armedPlayer.color,
                              shape: armedPlayer.shape,
                              seatNumber: players.indexOf(armedPlayer) + 1,
                            },
                            stagedAgainstOwner: commanderDamage.staging?.stagedFor(player) ?? 0,
                            pendingClaims: commanderDamage.pendingFor?.(player),
                            onPressSword: () => commanderDamage.onPressSword(player),
                            onStage: (step) => commanderDamage.onStage(player, step),
                            ...(commanderDamage.staging &&
                            commanderDamage.armedPlayerId === player.id
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
      </Animated.View>
    </View>
  )
}

export { getPlayerGridLayoutOptions } from "@/features/game/playerLayouts"
export type { PlayerGridLayoutVariant } from "@/features/game/playerLayouts"
export {
  getPlayerContentRotation,
  getPlayerGridLayout,
  getPlayerGridMenuAnchor,
  getPlayerGridRowFlex,
  getPlayerGridRows,
} from "./playerGridGeometry"

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
  if (rows.length === 1) return undefined
  if (row !== boundary - 1 && row !== boundary) return undefined
  const upper = row === boundary - 1
  const count = rows[row].length
  const middle = Math.floor(count / 2)
  if (count % 2) return column === middle ? { edgeCenter: upper ? "bottom" : "top" } : undefined
  if (column === middle - 1) return { corner: upper ? "bottomRight" : "topRight" }
  if (column === middle) return { corner: upper ? "bottomLeft" : "topLeft" }
  return undefined
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

const $fixedGrid: ViewStyle = { position: "absolute", left: "50%", top: "50%" }

const $frame: ViewStyle = { flex: 1, width: "100%" }

const $unmeasured: ViewStyle = { opacity: 0 }
