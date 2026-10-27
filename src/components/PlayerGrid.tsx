import { useCallback, useState } from "react"
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native"
import { Platform, useWindowDimensions, View } from "react-native"
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useSeatCommanders } from "@/features/decks/seatCommander"
import type { SeatDeck } from "@/features/decks/useSeatDeckCards"
import type { DiceSeatChip } from "@/features/game/dice"
import { COMMANDER_SLOTS, MAX_COMMANDER_DAMAGE, PARTNER_COMMANDER } from "@/features/game/domain"
import { type PlayerGridLayoutVariant, type SeatOrder } from "@/features/game/playerLayouts"
import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import type { TableRuntime } from "@/features/game/tableRuntime"
import {
  cornersSeenTurned,
  foldTurn,
  rotateRectAround,
  type SquaredCorners,
  type TableTurn,
  windowRectToPanel,
} from "@/features/game/tableTurn"
import type {
  CommanderBoardPlayer,
  CommanderSlot,
  GamePlayer,
  LifeDelta,
  PlayerId,
} from "@/features/game/types"
import type { useGameBoardOrientation } from "@/features/game/useGameBoardOrientation"
import { tableItemRulesOf } from "@/features/rules/gameRules"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useStableCallbacks } from "@/utils/useStableCallbacks"
import { useTopEdgeBand } from "@/utils/useTopEdgeBand"

import { commanderBoardSeats, commanderFacing, commanderReach } from "./commanderDamageLayout"
import { counterOutReason, seatTableState } from "./CounterChips"
import type { LifeCardDice } from "./DiceSeatOverlay"
import { LifeCard, type LifeCardCommanderDamage, type LifeCardOut } from "./LifeCard"
import {
  COMPACT_LIFE_GLYPH_LINE_HEIGHT,
  COMPACT_LIFE_TARGET_SIZE,
  getLifeFontSizeThatFits,
  getLifeTargetTextSpace,
  LIFE_GLYPH_LINE_HEIGHT,
  LIFE_TARGET_SIZE,
  TUCKS_INTO_SCREEN_CORNERS,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
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
  getPlayerGridCellRects,
} from "./playerGridGeometry"
import { PokemonSeatCard } from "./pokemon/PokemonSeatCard"
import { TurningSeat } from "./TurningSeat"
import { usePlayerGridLayout } from "./usePlayerGridLayout"
import { outReason, type OutReason, type OutState } from "../../convex/lib/outReason"

export interface CommanderDamageGridBinding {
  incomingFor: (player: GamePlayer, commander?: CommanderSlot) => Record<PlayerId, number>
  lethal: number
  armedPlayerId: PlayerId | null
  singleCommander?: boolean
  inspection?: { playerId: PlayerId | null; onChange: (playerId: PlayerId | null) => void }
  /**
   * Only set when assignment and confirmation live on separate devices. Local
   * play has nobody to confirm to, so each step applies as it is pressed and
   * there is nothing to stage or send.
   */
  staging?: {
    stagedFor: (player: GamePlayer, commander?: CommanderSlot) => number
    stagedTargets: number
    onSend: () => void
  }
  pendingFor?: (player: GamePlayer) => LifeCardCommanderDamage["pendingClaims"]
  onPressSword: (player: GamePlayer) => void
  onStage: (player: GamePlayer, step: number, commander?: CommanderSlot) => void
}

function strongerCommander(
  first: Record<PlayerId, number>,
  partner: Record<PlayerId, number>,
): Record<PlayerId, number> {
  const incoming = { ...first }
  for (const [playerId, total] of Object.entries(partner) as [PlayerId, number][])
    incoming[playerId] = Math.max(incoming[playerId] ?? 0, total)
  return incoming
}

export interface DiceGridBinding {
  armed: LifeCardDice["armed"] | null
  leaving?: LifeCardDice["armed"] | null
  seatFor: (player: GamePlayer) => LifeCardDice["view"]
  chipsFor: (player: GamePlayer) => readonly DiceSeatChip[]
  onPressSeat: (player: GamePlayer) => void
  onChoose: (player: GamePlayer, order: "first" | "second") => void
  onPressChip: (player: GamePlayer, chip: DiceSeatChip) => void
}

function lifeCardOut(
  reason: OutReason,
  players: readonly GamePlayer[],
  system: PlaySystemId | undefined,
  table: TableRuntime | undefined,
): LifeCardOut {
  switch (reason.cause) {
    case "life":
      return {
        cause: "life",
        reason: translate(`board:lifeCard.outOn.${playSystemRules(system).id}`),
      }
    case "counter":
      return {
        cause: "counter",
        counterId: reason.counterId,
        amount: reason.value,
        reason: counterOutReason({
          id: reason.counterId,
          label:
            table?.tableRules.counters.find(({ id }) => id === reason.counterId)?.label ??
            reason.counterId,
        }),
      }
    case "commanderDamage": {
      const attacker = players.find(({ id }) => id === reason.fromPlayerId)
      return {
        cause: "commanderDamage",
        amount: reason.total,
        attacker: attacker && {
          color: attacker.color,
          shape: attacker.shape,
          seatNumber: players.indexOf(attacker) + 1,
        },
        reason: attacker
          ? translate("board:lifeCard.outFrom", { total: reason.total, name: attacker.name })
          : translate("board:outReason.commanderDamage"),
      }
    }
  }
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
    onPressChip: stable(`dice-chip:${player.id}`, (chip: DiceSeatChip) =>
      dice.onPressChip(player, chip),
    ),
  }
}

export interface PlayerGridProps {
  players: GamePlayer[]
  boardOrientation?: Omit<ReturnType<typeof useGameBoardOrientation>, "frameRef" | "nativeFrame"> &
    Partial<Pick<ReturnType<typeof useGameBoardOrientation>, "nativeFrame">> & {
      insets?: LifeCardContentInsets
      touchRotation?: number
      tableTurn?: TableTurn
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
  outState?: OutState
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
  outState,
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
  const reportedInsets = boardOrientation?.insets
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
  const cutout = getCornerCutout(reportedInsets, { width, height })
  const insets = cutout ? { ...reportedInsets, [cutout.edge]: 0 } : reportedInsets
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const screenTopEdgeBand = useTopEdgeBand()
  const topEdgeBand = boardRotation === 0 ? screenTopEdgeBand : 0
  const [board, setBoard] = useState({ width: 0, height: 0 })
  const stable = useStableCallbacks()
  const [commanderPowers, setCommanderPowers] = useState<Partial<Record<string, number>>>({})
  const [benched, setBenched] = useState<{ playerId: PlayerId; index: number } | null>(null)
  if (benched && benched.playerId !== commanderDamage?.armedPlayerId) setBenched(null)
  /** why: once the attacker has tapped a target, the next step is finishing, so the pulse moves from the targets to the attacker's mark. */
  const [actedFor, setActedFor] = useState<PlayerId | null>(null)
  if (actedFor && actedFor !== commanderDamage?.armedPlayerId) setActedFor(null)
  const systemId = playSystemRules(system).id
  const tableItemRules = tableItemRulesOf(system)
  const tableTurn = boardOrientation?.tableTurn
  const holderAngle = tableTurn?.landed
    ? undefined
    : boardOrientation?.touchRotation && -boardOrientation.touchRotation
  const layout = usePlayerGridLayout({
    playerCount: players.length,
    width,
    height,
    fontScale,
    layoutVariant,
    holderAngle,
  })
  // why: a board given its size places seats from it in the same render, since the measured size arrives a frame later and drew the seats squished for that frame when the size changed.
  const seatBoard = boardOrientation ? { width, height } : board
  const cellSize = getCellSize({
    board: { width: seatBoard.width, height: seatBoard.height - topEdgeBand },
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
  // why: closed, the outer display drew each seat in a cell of the closed board, so an unfolding seat's total starts at the size it had there.
  const foldedCellSize = getCellSize({
    board: { width: seatBoard.height / 2, height: seatBoard.width },
    layout: getPlayerGridLayout({
      playerCount: players.length,
      width: seatBoard.height / 2,
      height: seatBoard.width,
      layoutVariant,
    }),
    gap: spacing.xxs,
  })
  const foldedLifeFontSizeFor = useCallback(
    (digits: number) =>
      getLifeFontSize({
        cellWidth: foldedCellSize.cellWidth,
        cellHeight: foldedCellSize.cellHeight,
        digits,
        fontScale,
        targetSize: lifeTargetSize,
        sidewaysGlyphReserve,
      }),
    [
      foldedCellSize.cellWidth,
      foldedCellSize.cellHeight,
      fontScale,
      lifeTargetSize,
      sidewaysGlyphReserve,
    ],
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
  // why: a Table board landed upside down on the panel puts each slot's player in the opposite slot.
  const slotSeat = (slot: number) => {
    const seated = tableTurn?.landed === "reversed" ? players.length - 1 - slot : slot
    return seatOrder?.[seated] ?? seated
  }
  const seatedRows = rows.map((row) => row.map((slot) => (slot === null ? null : slotSeat(slot))))
  const rowFlexes = rows.map((row) => getPlayerGridRowFlex(row, layout))
  const turning =
    tableTurn && Math.abs(holderAngle ?? 0) === 90 && seatBoard.width > 0
      ? tableTurnCells({
          playerCount: players.length,
          layout,
          board: seatBoard,
          gap: spacing.xxs,
          topInset: topEdgeBand,
          holderAngle: holderAngle ?? 0,
          tableTurn,
          radius: layout.compact ? spacing.md : spacing.lg,
        })
      : undefined
  // why: seats sit by position in one list keyed by player rather than inside flex rows, so a seat that changes rows moves instead of remounting.
  const cellRects =
    seatBoard.width > 0
      ? getPlayerGridCellRects({
          playerCount: players.length,
          layout,
          board: seatBoard,
          gap: spacing.xxs,
          topInset: topEdgeBand,
        })
      : undefined
  const menuJunction = getFourCardMenuJunction(rows)
  const fallbackMenuBoundary = menuJunction ? null : getCentralMenuBoundary(rows, layout)
  const boardSeats = commanderDamage
    ? commanderBoardSeats(
        seatedRows,
        players.map(({ id }) => id),
      )
    : null
  const armedPlayer = players.find(({ id }) => id === commanderDamage?.armedPlayerId)
  const armedIndex = armedPlayer ? players.indexOf(armedPlayer) : -1
  const seatCommanders = useSeatCommanders(
    commanderDamage && armedPlayer ? getSeatDeck?.(armedPlayer) : undefined,
  )
  const attackers = commanderDamage?.singleCommander ? seatCommanders.slice(0, 1) : seatCommanders
  const armedCommanders = (
    attackers.length ? attackers : [{ name: undefined, power: undefined }]
  ).map((commander, index) => ({
    name: commander.name,
    power: commanderPowers[`${armedPlayer?.id}:${index}`] ?? commander.power ?? 1,
    benched: benched?.index === index,
  }))
  const seatRotations = new Map<number, LifeCardContentRotation>()
  rows.forEach((row, rowIndex) =>
    row.forEach((slot, columnIndex) => {
      const index = seatedRows[rowIndex][columnIndex]
      if (slot === null || index === null) return
      seatRotations.set(
        index,
        getPlayerContentRotation({
          playerCount: players.length,
          layout,
          row,
          rowIndex,
          columnIndex,
          slot,
        }),
      )
    }),
  )
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
        {rows.flatMap((row, rowIndex) =>
          row.map((slot, columnIndex) => {
            const index = seatedRows[rowIndex][columnIndex]
            if (slot === null || index === null) return null
            const rect = cellRects?.get(slot)
            const seatStyle = [
              $seat,
              rect && { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
            ]
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
              cutout: seatCutout(cutout, contentRotation, screenEdges),
            }
            const fallbackMenu =
              fallbackMenuBoundary === null
                ? undefined
                : fallbackMenuAt(rows, fallbackMenuBoundary, rowIndex, columnIndex)
            const menuCorner =
              menuCornerAt(menuJunction, rowIndex, columnIndex) ?? fallbackMenu?.corner
            const seatDice = seatDiceFor(dice, player, stable)
            const seatTable = seatTableState(table, player.id)
            const out = outState && outReason(outState, player.id)
            const firstIncoming = commanderDamage?.incomingFor(player) ?? NO_INCOMING
            const partnerIncoming =
              commanderDamage?.incomingFor(player, PARTNER_COMMANDER) ?? NO_INCOMING
            if (table?.tableRules.pokemon) {
              return (
                <View key={player.id} testID={`player-cell-seat-${seatNumber}`} style={seatStyle}>
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
            const turningFrom = turning?.cells.get(slot)
            const turningTo = turning?.tableCells.get(slot)
            const turningFolded = turning?.foldedCells.get(slot)
            const lifeCard = (liveSize?: SharedValue<{ width: number; height: number }>) => (
              <LifeCard
                liveSize={liveSize}
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
                unfold={
                  turning && liveSize
                    ? { progress: turning.unfolded, lifeFontSizeFor: foldedLifeFontSizeFor }
                    : undefined
                }
                system={system}
                lifeStep={lifeStep}
                disabled={disabled || playerDisabled}
                ownership={ownership}
                staleSince={getStaleSince?.(player)}
                out={out && lifeCardOut(out, players, system, table)}
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
                        incoming: strongerCommander(firstIncoming, partnerIncoming),
                        lethal: commanderDamage.lethal,
                        armedPlayerId: commanderDamage.armedPlayerId,
                        attackerName: armedPlayer?.name,
                        attacker: armedPlayer && {
                          color: armedPlayer.color,
                          shape: armedPlayer.shape,
                          seatNumber: armedIndex + 1,
                          rotation: seatRotations.get(armedIndex),
                        },
                        commanders: armedPlayer
                          ? armedCommanders.map((commander, index) => ({
                              ...commander,
                              total:
                                ((index ? partnerIncoming : firstIncoming)[armedPlayer.id] ?? 0) +
                                (commanderDamage.staging?.stagedFor(
                                  player,
                                  COMMANDER_SLOTS[index],
                                ) ?? 0),
                            }))
                          : undefined,
                        onPowerStep: stable(`power:${player.id}`, (step: 1 | -1, index: number) =>
                          setCommanderPowers((current) => ({
                            ...current,
                            [`${player.id}:${index}`]: Math.min(
                              MAX_COMMANDER_DAMAGE,
                              Math.max(
                                1,
                                (current[`${player.id}:${index}`] ?? armedCommanders[index].power) +
                                  step,
                              ),
                            ),
                          })),
                        ),
                        onToggleCommander: stable(`toggle:${player.id}`, (index: number) =>
                          setBenched((current) =>
                            current === null
                              ? { playerId: player.id, index }
                              : current.index === index
                                ? null
                                : current,
                          ),
                        ),
                        facing:
                          armedIndex >= 0
                            ? commanderFacing(seatedRows, armedIndex, index)
                            : undefined,
                        reach:
                          armedIndex >= 0 && armedIndex !== index
                            ? commanderReach({
                                gridRows: seatedRows,
                                rowFlexes,
                                board: {
                                  width: board.width,
                                  height: board.height - topEdgeBand,
                                },
                                attackerIndex: armedIndex,
                                defenderIndex: index,
                              })
                            : undefined,
                        pendingClaims: commanderDamage.pendingFor?.(player),
                        onPressSword: stable(`sword:${player.id}`, () =>
                          commanderDamage.onPressSword(player),
                        ),
                        acted: !!actedFor,
                        onStage: stable(`stage:${player.id}`, (step: number, index: number) => {
                          commanderDamage.onStage(player, step, COMMANDER_SLOTS[index])
                          setActedFor(commanderDamage.armedPlayerId)
                        }),
                        ...(commanderDamage.staging && commanderDamage.armedPlayerId === player.id
                          ? {
                              armBar: {
                                stagedTargets: commanderDamage.staging.stagedTargets,
                                onSend: stable("armSend", commanderDamage.staging.onSend),
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
                style={
                  liveSize
                    ? $squareCard
                    : getScreenCornerSquaringStyle({
                        rows,
                        rowIndex,
                        columnIndex,
                        insets: Platform.OS === "web" ? insets : undefined,
                      })
                }
              />
            )
            return (
              <View key={player.id} testID={`player-cell-seat-${seatNumber}`} style={seatStyle}>
                <TurningSeat
                  key={turning ? "turning" : "resting"}
                  turn={
                    turning && turningFrom && turningTo && turningFolded
                      ? {
                          angle: turning.angle,
                          unfolded: turning.unfolded,
                          folded: turningFolded,
                          cell: turningFrom,
                          table: turningTo,
                          board: turning.board,
                          corners: turning.corners(slot),
                        }
                      : undefined
                  }
                >
                  {lifeCard}
                </TurningSeat>
              </View>
            )
          }),
        )}
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

const NO_INCOMING: Record<PlayerId, number> = {}

const LIFE_CONTROL_GUTTER = 32
const LIFE_HEIGHT_RATIO = 0.5

/** why: each seat unfolds from where the outer display drew it into its cell, and in the center column moves on toward its cell in the Table board the players will see upright, which is the panel's Table board turned back by the holder's angle. */
function tableTurnCells(input: {
  playerCount: number
  layout: ReturnType<typeof getPlayerGridLayout>
  board: { width: number; height: number }
  gap: number
  topInset: number
  holderAngle: number
  tableTurn: TableTurn
  radius: number
}) {
  const { playerCount, layout, board, gap, topInset, holderAngle, tableTurn, radius } = input
  const tableLayout = getPlayerGridLayout({
    playerCount,
    width: board.width,
    height: board.height,
    layoutVariant: layout.variant,
    spansHinge: true,
  })
  const center = { x: board.width / 2, y: board.height / 2 }
  const uprightTable = getPlayerGridCellRects({
    playerCount,
    layout: tableLayout,
    board,
    gap,
    topInset,
  })
  // why: closed, the outer display drew this board upright over the inner display's right half, so the seats spread out from there as the hinge opens.
  const outer = { width: board.height / 2, height: board.width }
  const outerLayout = getPlayerGridLayout({ playerCount, ...outer, layoutVariant: layout.variant })
  const foldedBoard = getPlayerGridCellRects({
    playerCount,
    layout: outerLayout,
    board: outer,
    gap,
  })
  const tableRows = getPlayerGridRows(playerCount, tableLayout)
  const rows = getPlayerGridRows(playerCount, layout)
  const cells = getPlayerGridCellRects({ playerCount, layout, board, gap, topInset })
  const outerFacings = facingsBySlot(playerCount, outerLayout)
  const openFacings = facingsBySlot(playerCount, layout)
  const quarter = -Math.sign(holderAngle)
  return {
    angle: tableTurn.angle,
    unfolded: tableTurn.unfolded,
    // why: the card squares only the corners of the cell it lands in; one way round lands each player in their own Table cell, the other in the cell across the board.
    corners: (slot: number) => {
      const resting = squaredCornersOf(rows, slot)
      if (!layout.centerColumn)
        return { radius, resting, landingClockwise: resting, landingCounterclockwise: resting }
      const upright = squaredCornersOf(tableRows, slot)
      const reversed = squaredCornersOf(tableRows, playerCount - 1 - slot)
      return {
        radius,
        resting,
        landingClockwise: cornersSeenTurned(quarter > 0 ? upright : reversed, 1),
        landingCounterclockwise: cornersSeenTurned(quarter > 0 ? reversed : upright, -1),
      }
    },
    board,
    foldedCells: new Map(
      [...foldedBoard].map(([slot, rect]) => [
        slot,
        {
          ...windowRectToPanel({ ...rect, x: rect.x + outer.width }, board, holderAngle),
          turn: foldTurn(outerFacings.get(slot) ?? 0, openFacings.get(slot) ?? 0, holderAngle),
        },
      ]),
    ),
    cells,
    // why: only the center column turns on to Table; any other board stays where it unfolded.
    tableCells: layout.centerColumn
      ? new Map(
          [...uprightTable].map(([slot, rect]) => [
            slot,
            rotateRectAround(rect, center, holderAngle / 90),
          ]),
        )
      : cells,
  }
}

function facingsBySlot(playerCount: number, layout: ReturnType<typeof getPlayerGridLayout>) {
  return new Map(
    getPlayerGridRows(playerCount, layout).flatMap((row, rowIndex) =>
      row.flatMap((slot, columnIndex) =>
        slot === null
          ? []
          : [
              [
                slot,
                getPlayerContentRotation({ playerCount, layout, row, rowIndex, columnIndex, slot }),
              ] as const,
            ],
      ),
    ),
  )
}

function squaredCornersOf(rows: (number | null)[][], slot: number): SquaredCorners {
  const rowIndex = rows.findIndex((row) => row.includes(slot))
  const style = getScreenCornerSquaringStyle({
    rows,
    rowIndex,
    columnIndex: rows[rowIndex].indexOf(slot),
  })
  return [
    style?.borderTopLeftRadius === 0 ? 1 : 0,
    style?.borderTopRightRadius === 0 ? 1 : 0,
    style?.borderBottomRightRadius === 0 ? 1 : 0,
    style?.borderBottomLeftRadius === 0 ? 1 : 0,
  ]
}

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

/** why: the iPhone Duo's outer display reports the camera hole in its top corner as safe area down that whole side, the only upright screen with a side inset. Seats keep their full width and only the chrome in that corner moves. */
export function getCornerCutout(
  insets: LifeCardContentInsets,
  board: { width: number; height: number },
) {
  if (board.height <= board.width) return undefined
  const edge =
    insets.right > insets.top
      ? ("right" as const)
      : insets.left > insets.top
        ? ("left" as const)
        : undefined
  return edge && { edge, size: insets[edge] }
}

function seatCutout(
  cutout: ReturnType<typeof getCornerCutout>,
  rotation: LifeCardContentRotation,
  screenEdges: Record<LifeCardEdge, boolean>,
): LifeCardContentInsets["cutout"] {
  if (!cutout || !screenEdges.top || !screenEdges[cutout.edge]) return undefined
  // why: corner chrome slides along its own row, so it stays against the seat's outer edge.
  const facesCutoutSide = rotation === (cutout.edge === "right" ? -90 : 90)
  return facesCutoutSide
    ? { edge: "top", side: cutout.edge, size: cutout.size }
    : { edge: cutout.edge, side: "top", size: cutout.size }
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

const $seat: ViewStyle = { position: "absolute" }

const $squareCard: ViewStyle = { borderRadius: 0 }

const $fixedGrid: ViewStyle = { position: "absolute", left: "50%", top: "50%" }

const $frame: ViewStyle = { flex: 1, width: "100%" }

const $unmeasured: ViewStyle = { opacity: 0 }
