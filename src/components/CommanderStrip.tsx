import { memo, useEffect, useState, type ComponentProps } from "react"
import type { LayoutRectangle, TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated from "react-native-reanimated"

import type { CommanderBoardPlayer, PlayerId } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"

import { BoardPressable } from "./BoardPressable"
import type { CommanderBoardSeat } from "./commanderDamageLayout"
import { Icon } from "./Icon"
import { overlayTint } from "./LifeControls"
import {
  cornerOffset,
  type LifeCardEdge,
  type LifeCardScreenEdges,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
} from "./playerCardTypes"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"

const DISC_SIZE = 24
const COMPACT_DISC_SIZE = 20

export interface CommanderStripProps {
  seatNumber: number
  identity: string
  ownerPlayerId: PlayerId
  players: readonly CommanderBoardPlayer[]
  seats: readonly CommanderBoardSeat[]
  incoming: Record<PlayerId, number>
  lethal: number
  foreground: string
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  screenEdges?: LifeCardScreenEdges
  compact?: boolean
  open: boolean
  inspectDisabled?: boolean
  closeIconStyle?: ComponentProps<typeof Animated.View>["style"]
  onBoundsChange?: (bounds: LayoutRectangle) => void
  onPipsChange?: (pips: ReadonlyMap<PlayerId, LayoutRectangle>) => void
  onToggle: () => void
}

export function commanderDamageDealers(
  players: readonly CommanderBoardPlayer[],
  ownerPlayerId: PlayerId,
  incoming: Record<PlayerId, number>,
) {
  return players.filter(({ id }) => id !== ownerPlayerId && (incoming[id] ?? 0) > 0)
}

export const CommanderStrip = memo(function CommanderStrip({
  seatNumber,
  identity,
  ownerPlayerId,
  players,
  seats,
  incoming,
  lethal,
  foreground,
  contentRotation,
  contentInsets,
  screenEdges,
  compact,
  open,
  inspectDisabled,
  closeIconStyle,
  onToggle,
  onBoundsChange,
  onPipsChange,
}: CommanderStripProps) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const [stripBounds, setStripBounds] = useState<LayoutRectangle | null>(null)
  const [mapBounds, setMapBounds] = useState<LayoutRectangle | null>(null)
  const [rowBounds, setRowBounds] = useState<ReadonlyMap<number, LayoutRectangle>>(new Map())
  const [pipBounds, setPipBounds] = useState<
    ReadonlyMap<PlayerId, { row: number; bounds: LayoutRectangle }>
  >(new Map())
  useEffect(() => {
    if (!onPipsChange || !stripBounds || !mapBounds) return
    const pips = new Map<PlayerId, LayoutRectangle>()
    for (const [playerId, { row, bounds }] of pipBounds) {
      const rowOrigin = rowBounds.get(row)
      if (!rowOrigin) continue
      pips.set(playerId, {
        ...bounds,
        x: stripBounds.x + mapBounds.x + rowOrigin.x + bounds.x,
        y: stripBounds.y + mapBounds.y + rowOrigin.y + bounds.y,
      })
    }
    onPipsChange(pips)
  }, [stripBounds, mapBounds, rowBounds, pipBounds, onPipsChange])
  useEffect(() => {
    if (stripBounds && mapBounds) {
      onBoundsChange?.({
        ...mapBounds,
        x: stripBounds.x + mapBounds.x,
        y: stripBounds.y + mapBounds.y,
      })
    }
  }, [stripBounds, mapBounds, onBoundsChange])
  const disc = compact ? COMPACT_DISC_SIZE : DISC_SIZE
  const glyphRotation: ViewStyle = { transform: [{ rotate: `${contentRotation}deg` }] }
  const dealt = commanderDamageDealers(players, ownerPlayerId, incoming)
  const boardRows = Array.from(new Set(seats.map(({ row }) => row)))
    .sort((a, b) => a - b)
    .map((row) => seats.filter((seat) => seat.row === row).sort((a, b) => a.column - b.column))
  const corner = stripCorner(contentRotation, contentInsets)
  const [edge, side] = corner
  const [horizontal, vertical] = edge === "left" || edge === "right" ? [edge, side] : [side, edge]
  const closePosition: ViewStyle = {
    alignItems: horizontal === "left" ? "flex-start" : "flex-end",
    justifyContent: vertical === "top" ? "flex-start" : "flex-end",
    padding: spacing.xxs,
  }
  if (dealt.length === 0) return null

  return (
    <View
      testID={`commander-strip-seat-${seatNumber}`}
      onLayout={(event) => setStripBounds(event.nativeEvent.layout)}
      style={[
        themed($strip),
        stripEdge(corner, spacing.xs, contentInsets, screenEdges),
        {
          flexDirection: stripDirection(contentRotation),
        },
      ]}
    >
      <BoardPressable
        testID={`commander-${open ? "strip-close" : "map"}-seat-${seatNumber}`}
        onLayout={(event) => setMapBounds(event.nativeEvent.layout)}
        accessibilityRole="button"
        accessibilityLabel={
          open
            ? translate("board:commander.closeFor", { identity })
            : translate("board:commander.showFor", {
                identity,
                sources: dealt
                  .map((player) =>
                    translate("board:commander.amountFrom", {
                      amount: incoming[player.id],
                      name: player.name,
                    }),
                  )
                  .join(", "),
              })
        }
        accessibilityState={{ expanded: open, disabled: !!inspectDisabled }}
        disabled={inspectDisabled}
        hitSlop={open ? 12 : 2}
        onPress={onToggle}
        style={({ pressed }) => [themed($map), pressed && { opacity: 0.72 }]}
      >
        {boardRows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            onLayout={({ nativeEvent: { layout } }) =>
              setRowBounds((current) => new Map(current).set(rowIndex, layout))
            }
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[themed($mapRow), open && $hidden]}
          >
            {row.map(({ playerId }) => {
              const playerIndex = players.findIndex(({ id }) => id === playerId)
              const player = players[playerIndex]
              if (!player) return null
              const size = { width: disc, height: disc }
              if (playerId === ownerPlayerId)
                return (
                  <View
                    key={playerId}
                    testID={`commander-own-seat-${seatNumber}`}
                    style={[themed($ownSeat), size]}
                  >
                    <PlayerMark
                      seatNumber={playerIndex + 1}
                      shape={player.shape}
                      color={foreground}
                      rotation={contentRotation}
                      size={Math.round(disc * 0.6)}
                    />
                  </View>
                )
              const total = incoming[playerId] ?? 0
              const ink = accessibleForeground(player.color)
              return (
                <View
                  key={playerId}
                  testID={`commander-pip-seat-${seatNumber}-${playerId}`}
                  onLayout={({ nativeEvent: { layout } }) =>
                    setPipBounds((current) =>
                      new Map(current).set(playerId, { row: rowIndex, bounds: layout }),
                    )
                  }
                  style={[
                    themed($disc),
                    size,
                    { backgroundColor: player.color, borderColor: overlayTint(foreground, 0.5) },
                    total === 0 && themed($idleDisc),
                    total >= lethal && [themed($lethalDisc), { borderColor: foreground }],
                  ]}
                >
                  {total > 0 ? (
                    <Text
                      text={String(total)}
                      weight="bold"
                      maxFontSizeMultiplier={1}
                      style={[
                        themed(compact ? $compactCount : $count),
                        { color: ink },
                        glyphRotation,
                      ]}
                    />
                  ) : (
                    <PlayerMark
                      seatNumber={playerIndex + 1}
                      shape={player.shape}
                      color={ink}
                      rotation={contentRotation}
                      size={Math.round(disc * 0.5)}
                    />
                  )}
                </View>
              )
            })}
          </View>
        ))}
        <Animated.View
          testID={`commander-strip-close-icon-seat-${seatNumber}`}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, closePosition, !open && $hidden, closeIconStyle]}
        >
          <Icon icon="x" color={foreground} size={18} />
        </Animated.View>
      </BoardPressable>
    </View>
  )
}, structurallyEqual)

function stripDirection(rotation: LifeCardContentRotation): ViewStyle["flexDirection"] {
  if (rotation === 90) return "column"
  if (rotation === -90) return "column-reverse"
  if (rotation === 180) return "row-reverse"
  return "row"
}

const STRIP_CORNER = {
  0: ["bottom", "right", "left"],
  180: ["top", "left", "right"],
  90: ["left", "bottom", "top"],
  [-90]: ["right", "top", "bottom"],
} as const satisfies Record<LifeCardContentRotation, readonly LifeCardEdge[]>

const OPPOSITE_EDGE = { top: "bottom", bottom: "top", left: "right", right: "left" } as const

/** why: a camera hole in the grid's corner would push it into the name, so it moves to the seat's inner corner on the same end and the name keeps its row. */
export function commanderStripMovesInward(
  rotation: LifeCardContentRotation,
  insets?: LifeCardContentInsets,
) {
  const [edge, side] = STRIP_CORNER[rotation]
  return insets?.cutout?.edge === side && insets.cutout.side === edge
}

function stripCorner(rotation: LifeCardContentRotation, insets?: LifeCardContentInsets) {
  const [edge, side, start] = STRIP_CORNER[rotation]
  return [
    commanderStripMovesInward(rotation, insets) ? OPPOSITE_EDGE[edge] : edge,
    side,
    start,
  ] as const
}

function stripEdge(
  [edge, side, start]: ReturnType<typeof stripCorner>,
  gap: number,
  insets?: LifeCardContentInsets,
  screenEdges?: LifeCardScreenEdges,
): ViewStyle {
  return {
    [edge]: cornerOffset(gap, edge, side, insets, screenEdges),
    [side]: cornerOffset(gap, side, edge, insets, screenEdges),
    [start]: gap + (insets?.[start] ?? 0),
  }
}

const $strip: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 10,
  justifyContent: "flex-end",
  alignItems: "center",
})

const $map: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxxs,
  padding: spacing.xxs,
  borderRadius: spacing.xs,
})

const $mapRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.xxxs,
})

const $disc: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 999,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
})

const $idleDisc: ThemedStyle<ViewStyle> = () => ({ opacity: 0.45 })

const $lethalDisc: ThemedStyle<ViewStyle> = () => ({ borderWidth: 2 })

const $count: ThemedStyle<TextStyle> = () => ({
  fontSize: 13,
  lineHeight: 16,
  fontVariant: ["tabular-nums"],
})

const $compactCount: ThemedStyle<TextStyle> = () => ({
  fontSize: 11,
  lineHeight: 14,
  fontVariant: ["tabular-nums"],
})

const $ownSeat: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.35,
})

const $hidden: ViewStyle = { opacity: 0 }
