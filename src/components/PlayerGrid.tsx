import { useCallback, useState } from "react"
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native"
import { Platform, useWindowDimensions, View } from "react-native"
import Animated, { useAnimatedStyle } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { DiceSeatChip } from "@/features/game/dice"
import { type PlayerGridLayoutVariant, type SeatOrder } from "@/features/game/playerLayouts"
import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { TableRuntime } from "@/features/game/tableRuntime"
import type { CommanderBoardPlayer, GamePlayer, LifeDelta, PlayerId } from "@/features/game/types"
import type { useGameBoardOrientation } from "@/features/game/useGameBoardOrientation"
import { tableItemRulesOf } from "@/features/rules/gameRules"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useStableCallbacks } from "@/utils/useStableCallbacks"
import { useTopEdgeBand } from "@/utils/useTopEdgeBand"

import { commanderBoardSeats } from "./commanderDamageLayout"
import { counterOutReason, losingCounter, seatTableState } from "./CounterChips"
import type { LifeCardDice } from "./DiceSeatOverlay"
import { LifeCard, type LifeCardCommanderDamage } from "./LifeCard"
import {
  COMPACT_LIFE_GLYPH_LINE_HEIGHT,
  COMPACT_LIFE_TARGET_SIZE,
  getLifeFontSizeThatFits,
  getLifeTargetTextSpace,
  LIFE_GLYPH_LINE_HEIGHT,
  LIFE_TARGET_SIZE,
  TUCKS_INTO_SCREEN_CORNERS,
  type LifeCardContentInsets,
  type LifeCardEdge,
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
import { PokemonSeatCard } from "./pokemon/PokemonSeatCard"
import type { SeatDeck } from "./pokemon/usePokemonDeck"

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

export interface DiceGridBinding {
  armed: LifeCardDice["armed"] | null
  leaving?: LifeCardDice["armed"] | null
  seatFor: (player: GamePlayer) => LifeCardDice["view"]
  chipsFor: (player: GamePlayer) => readonly DiceSeatChip[]
  onPressSeat: (player: GamePlayer) => void
  onChoose: (player: GamePlayer, order: "first" | "second") => void
  onClearChip: (player: GamePlayer, chip: DiceSeatChip) => void
}

function seatOwnership(
  player: GamePlayer,
  {
    isPlayerOwned,
    isPlayerDisabled,
    disabled,
  }: Pick<PlayerGridProps, "isPlayerOwned" | "isPlayerDisabled" | "disabled">,
) {
  if (isPlayerOwned) return isPlayerOwned(player) ? "owned" : "unowned"
  if (disabled) return "disabled"
  if (isPlayerDisabled) return isPlayerDisabled(player) ? "unowned" : "owned"
  return undefined
}

function seatDiceFor(
  dice: DiceGridBinding | undefined,
  player: GamePlayer,
  stable: ReturnType<typeof useStableCallbacks>,
): LifeCardDice | undefined {
  const view = dice?.seatFor(player)
  const chips = dice?.chipsFor(player)
  const armed = dice?.armed ?? dice?.leaving ?? undefined
  if (!dice || !(view || armed || chips?.length)) return undefined
  return {
    view,
    armed,
    leaving: !dice.armed && !!dice.leaving,
    chips,
    onPress: stable(`dice:${player.id}`, () => dice.onPressSeat(player)),
    onChoose: stable(`dice-choose:${player.id}`, (order: "first" | "second") =>
      dice.onChoose(player, order),
    ),
    onClearChip: stable(`dice-chip:${player.id}`, (chip: DiceSeatChip) =>
      dice.onClearChip(player, chip),
    ),
  }
}

export interface PlayerGridProps {
  players: GamePlayer[]
  boardOrientation?: Omit<ReturnType<typeof useGameBoardOrientation>, "frameRef" | "nativeFrame"> &
    Partial<Pick<ReturnType<typeof useGameBoardOrientation>, "nativeFrame">> & {
      insets?: LifeCardContentInsets
      touchRotation?: number
    }
  system?: PlaySystemId
  lifeStep?: number
  layoutVariant?: PlayerGridLayoutVariant
  seatOrder?: SeatOrder
  disabled?: boolean
  isPlayerDisabled?: (player: GamePlayer) => boolean
  isPlayerOwned?: (player: GamePlayer) => boolean
  getStaleSince?: (player: GamePlayer) => number | undefined
  /** why: only decks the signed-in user owns can be read, so screens return a version only for seats they control. */
  getSeatDeck?: (player: GamePlayer) => SeatDeck | undefined
  isPlayerEliminated?: (player: GamePlayer) => boolean
  isPlayerFoil?: (player: GamePlayer) => boolean
  commanderDamage?: CommanderDamageGridBinding
  table?: TableRuntime
  dice?: DiceGridBinding
  onOpenRule?: (ruleId: string) => void
  onPlayStart?: () => void
  onChange: (playerId: PlayerId, delta: LifeDelta) => void
  style?: StyleProp<ViewStyle>
}

export function PlayerGrid({
  players,
  boardOrientation,
  system,
  lifeStep,
  layoutVariant = "auto",
  seatOrder,
  disabled,
  isPlayerDisabled,
  isPlayerOwned,
  getStaleSince,
  getSeatDeck,
  isPlayerEliminated,
  isPlayerFoil,
  commanderDamage,
  table,
  dice,
  onOpenRule,
  onPlayStart,
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
  const insets = boardOrientation?.insets
    ? boardOrientation.insets
    : boardRotation === 90
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
  const screenTopEdgeBand = useTopEdgeBand()
  const topEdgeBand = boardRotation === 0 ? screenTopEdgeBand : 0
  const [board, setBoard] = useState({ width: 0, height: 0 })
  const stable = useStableCallbacks()
  const systemId = playSystemRules(system).id
  const tableItemRules = tableItemRulesOf(system)
  const layout = getPlayerGridLayout({
    playerCount: players.length,
    width,
    height,
    fontScale,
    layoutVariant,
  })
  const cellSize = getCellSize({
    board: { width: board.width, height: board.height - topEdgeBand },
    layout,
    gap: spacing.xxs,
  })
  const lifeTargetSize = layout.compact ? COMPACT_LIFE_TARGET_SIZE : LIFE_TARGET_SIZE
  const sidewaysGlyphReserve =
    2 * ((layout.compact ? COMPACT_LIFE_GLYPH_LINE_HEIGHT : LIFE_GLYPH_LINE_HEIGHT) + spacing.xs)
  const lifeFontSizeFor = useCallback(
    (digits: number) =>
      getLifeFontSize({
        cellWidth: cellSize.cellWidth,
        cellHeight: cellSize.cellHeight,
        digits,
        fontScale,
        targetSize: lifeTargetSize,
        sidewaysGlyphReserve,
      }),
    [cellSize.cellWidth, cellSize.cellHeight, fontScale, lifeTargetSize, sidewaysGlyphReserve],
  )

  function measureBoard(event: LayoutChangeEvent) {
    const { width: boardWidth, height: boardHeight } = event.nativeEvent.layout
    setBoard((current) =>
      current.width === boardWidth && current.height === boardHeight
        ? current
        : { width: boardWidth, height: boardHeight },
    )
  }

  const rows = getPlayerGridRows(players.length, layout)
  const seatedRows = rows.map((row) =>
    row.map((slot) => (slot === null ? null : (seatOrder?.[slot] ?? slot))),
  )
  const menuJunction = getFourCardMenuJunction(rows)
  const fallbackMenuBoundary = menuJunction ? null : getCentralMenuBoundary(rows, layout)
  const boardSeats = commanderDamage
    ? commanderBoardSeats(
        seatedRows,
        players.map(({ id }) => id),
      )
    : null
  const armedPlayer = players.find(({ id }) => id === commanderDamage?.armedPlayerId)
  const commanderPlayers = players.map(({ id, name, color, shape }): CommanderBoardPlayer => ({
    id,
    name,
    color,
    shape,
  }))

  return (
    <View testID="player-grid-frame" style={$frame}>
      <Animated.View
        testID="player-grid"
        accessibilityLabel={translate(`board:grid.label.${systemId}`, { count: players.length })}
        onLayout={measureBoard}
        style={[
          themed($grid),
          topEdgeBand ? { paddingTop: topEdgeBand } : null,
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
            {row.map((slot, columnIndex) => {
              const index = seatedRows[rowIndex][columnIndex]
              if (slot === null || index === null) {
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
              const contentRotation = getPlayerContentRotation({
                playerCount: players.length,
                layout,
                row,
                rowIndex,
                columnIndex,
                slot,
              })
              const ownership = seatOwnership(player, { isPlayerOwned, isPlayerDisabled, disabled })
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
              const seatDice = seatDiceFor(dice, player, stable)
              const seatTable = seatTableState(table, player.id)
              const losing = seatTable && losingCounter(seatTable)
              const eliminated = isPlayerEliminated?.(player)
                ? translate("board:outReason.commanderDamage")
                : losing && counterOutReason(losing)
              if (table?.tableRules.pokemon) {
                return (
                  <View
                    key={player.id}
                    testID={`player-cell-seat-${seatNumber}`}
                    style={themed($cell)}
                  >
                    <PokemonSeatCard
                      playerId={player.id}
                      playerName={player.name}
                      seatNumber={seatNumber}
                      shape={player.shape}
                      prizes={player.life}
                      color={player.color}
                      compact={layout.compact}
                      contentRotation={contentRotation}
                      contentInsets={contentInsets}
                      screenEdges={TUCKS_INTO_SCREEN_CORNERS ? screenEdges : undefined}
                      menuCorner={menuCorner}
                      menuEdgeCenter={fallbackMenu?.edgeCenter}
                      disabled={disabled || playerDisabled}
                      ownership={ownership}
                      staleSince={getStaleSince?.(player)}
                      deck={getSeatDeck?.(player)}
                      opponents={players
                        .filter(({ id }) => id !== player.id)
                        .map(({ id, name }) => ({ id, name }))}
                      table={table}
                      dice={seatDice}
                      onChangePrizes={stable(`change:${player.id}`, (delta: LifeDelta) =>
                        onChange(player.id, delta),
                      )}
                      onPlayStart={onPlayStart && stable("playStart", onPlayStart)}
                      style={getScreenCornerSquaringStyle({
                        rows,
                        rowIndex,
                        columnIndex,
                        insets: Platform.OS === "web" ? insets : undefined,
                      })}
                    />
                  </View>
                )
              }
              return (
                <View
                  key={player.id}
                  testID={`player-cell-seat-${seatNumber}`}
                  style={themed($cell)}
                >
                  <LifeCard
                    playerId={player.id}
                    playerName={player.name}
                    seatNumber={seatNumber}
                    shape={player.shape}
                    foil={isPlayerFoil?.(player)}
                    life={player.life}
                    color={player.color}
                    compact={layout.compact}
                    contentRotation={contentRotation}
                    boardRotation={boardOrientation?.touchRotation ?? boardRotation}
                    contentInsets={contentInsets}
                    screenEdges={TUCKS_INTO_SCREEN_CORNERS ? screenEdges : undefined}
                    menuCorner={menuCorner}
                    menuEdgeCenter={fallbackMenu?.edgeCenter}
                    lifeFontSizeFor={lifeFontSizeFor}
                    system={system}
                    lifeStep={lifeStep}
                    disabled={disabled || playerDisabled}
                    ownership={ownership}
                    staleSince={getStaleSince?.(player)}
                    eliminated={eliminated}
                    commanderDamage={
                      commanderDamage && boardSeats
                        ? {
                            ownerPlayerId: player.id,
                            players: commanderDamage.inspection ? commanderPlayers : undefined,
                            inspection: commanderDamage.inspection
                              ? {
                                  open: commanderDamage.inspection.playerId === player.id,
                                  onToggle: stable(`inspect:${player.id}`, () =>
                                    commanderDamage.inspection?.onChange(
                                      commanderDamage.inspection.playerId === player.id
                                        ? null
                                        : player.id,
                                    ),
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
                            onPressSword: stable(`sword:${player.id}`, () =>
                              commanderDamage.onPressSword(player),
                            ),
                            onStage: stable(`stage:${player.id}`, (step: number) =>
                              commanderDamage.onStage(player, step),
                            ),
                            ...(commanderDamage.staging &&
                            commanderDamage.armedPlayerId === player.id
                              ? {
                                  armBar: {
                                    stagedTargets: commanderDamage.staging.stagedTargets,
                                    onSend: stable("armSend", commanderDamage.staging.onSend),
                                    onCancel: stable("armCancel", commanderDamage.staging.onCancel),
                                  },
                                }
                              : {}),
                          }
                        : undefined
                    }
                    seatTable={
                      table && seatTable
                        ? {
                            ...seatTable,
                            editable: !(disabled || playerDisabled),
                            adjustCounter: stable(
                              `counter:${player.id}`,
                              (counterId: string, delta: number) =>
                                table.adjustCounter(player.id, counterId, delta),
                            ),
                            takeDesignation: stable(`take:${player.id}`, (designationId: string) =>
                              table.takeDesignation(player.id, designationId),
                            ),
                            releaseDesignation: stable(
                              `release:${player.id}`,
                              (designationId: string) =>
                                table.releaseDesignation(player.id, designationId),
                            ),
                            ...(tableItemRules && onOpenRule
                              ? { tableItemRules, openRule: stable("openRule", onOpenRule) }
                              : {}),
                          }
                        : undefined
                    }
                    dice={seatDice}
                    onPlayStart={onPlayStart && stable("playStart", onPlayStart)}
                    onChange={stable(`change:${player.id}`, (delta: LifeDelta) =>
                      onChange(player.id, delta),
                    )}
                    style={getScreenCornerSquaringStyle({
                      rows,
                      rowIndex,
                      columnIndex,
                      insets: Platform.OS === "web" ? insets : undefined,
                    })}
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
  getPlayerGridFacings,
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

/** why: on web, pass the insets. The page only reaches a rounded screen corner where the browser reports an inset; a browser tab or a solid status bar strip reports none. */
export function getScreenCornerSquaringStyle(input: {
  rows: (number | null)[][]
  rowIndex: number
  columnIndex: number
  insets?: LifeCardContentInsets
}): ViewStyle | undefined {
  const reachesCorner = (edge: LifeCardEdge, side: LifeCardEdge) =>
    !input.insets || input.insets[edge] > 0 || input.insets[side] > 0
  const touchesTopEdge = input.rowIndex === 0
  const touchesBottomEdge = input.rowIndex === input.rows.length - 1
  const touchesLeftEdge = input.columnIndex === 0
  const touchesRightEdge = input.columnIndex === input.rows[input.rowIndex].length - 1
  const squared: ViewStyle = {
    ...(touchesTopEdge && touchesLeftEdge && reachesCorner("top", "left")
      ? { borderTopLeftRadius: 0 }
      : null),
    ...(touchesTopEdge && touchesRightEdge && reachesCorner("top", "right")
      ? { borderTopRightRadius: 0 }
      : null),
    ...(touchesBottomEdge && touchesLeftEdge && reachesCorner("bottom", "left")
      ? { borderBottomLeftRadius: 0 }
      : null),
    ...(touchesBottomEdge && touchesRightEdge && reachesCorner("bottom", "right")
      ? { borderBottomRightRadius: 0 }
      : null),
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
