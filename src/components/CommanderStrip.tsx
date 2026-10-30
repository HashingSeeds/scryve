import { memo, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import type { LayoutRectangle, TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated"

import type { CommanderBoardPlayer, PlayerId } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { TAKEOVER_LAYERS } from "./CommanderDamageCardControls"
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
  // why: while a commander attacks this seat, the strip stays over the shadow with that attacker's total lit and the rest faded, and taps fall through to the hit target.
  attackerId?: PlayerId
  onBoundsChange?: (bounds: LayoutRectangle) => void
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
  attackerId,
  onToggle,
  onBoundsChange,
}: CommanderStripProps) {
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const [stripBounds, setStripBounds] = useState<LayoutRectangle | null>(null)
  const [mapBounds, setMapBounds] = useState<LayoutRectangle | null>(null)
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
  if (dealt.length === 0 && !attackerId) return null
  const attackerName = players.find(({ id }) => id === attackerId)?.name

  return (
    <View
      testID={`commander-strip-seat-${seatNumber}`}
      onLayout={(event) => setStripBounds(event.nativeEvent.layout)}
      pointerEvents={attackerId ? "none" : "auto"}
      style={[
        themed($strip),
        stripEdge(corner, spacing.xs, contentInsets, screenEdges),
        {
          flexDirection: stripDirection(contentRotation),
        },
        attackerId && $aboveShadow,
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
        accessible={!attackerId}
        disabled={inspectDisabled || !!attackerId}
        hitSlop={open ? 12 : 2}
        onPress={onToggle}
        style={({ pressed }) => [themed($map), pressed && { opacity: 0.72 }]}
      >
        {boardRows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            pointerEvents="none"
            accessibilityElementsHidden={!attackerId}
            importantForAccessibility={attackerId ? "auto" : "no-hide-descendants"}
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
                    style={[themed($ownSeat), size, attackerId && $faded]}
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
              const attacking = playerId === attackerId
              const pip = (
                <View
                  key={playerId}
                  testID={`commander-pip-seat-${seatNumber}-${playerId}`}
                  accessible={attacking}
                  accessibilityLabel={
                    attacking
                      ? translate("board:commander.totalFrom", {
                          damage: total,
                          name: attackerName,
                        })
                      : undefined
                  }
                  style={[
                    themed($disc),
                    size,
                    { backgroundColor: player.color, borderColor: overlayTint(foreground, 0.5) },
                    total === 0 && !attacking && themed($idleDisc),
                    total >= lethal && [themed($lethalDisc), { borderColor: foreground }],
                    attacking && { borderColor: foreground },
                    attackerId && !attacking && $faded,
                  ]}
                >
                  {total > 0 || attacking ? (
                    <Text
                      testID={attacking ? `commander-total-seat-${seatNumber}` : undefined}
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
              return attacking ? (
                <Pop key={playerId} value={total}>
                  {pip}
                </Pop>
              ) : (
                pip
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

/** why: the attacker's total pops as each hit lands, so a tap reads on the strip the defender is watching. */
function Pop({ value, children }: { value: number; children: ReactNode }) {
  const reducedMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const previous = useRef(value)
  useEffect(() => {
    const before = previous.current
    previous.current = value
    if (value <= before || reducedMotion !== false) return
    scale.value = withSequence(withTiming(1.35, { duration: 90 }), withTiming(1, { duration: 200 }))
  }, [reducedMotion, scale, value])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return <Animated.View style={style}>{children}</Animated.View>
}

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

/** why: the card corner the strip sits in, so other corner controls can keep clear of it. */
export function commanderStripCorner(
  rotation: LifeCardContentRotation,
  insets?: LifeCardContentInsets,
) {
  const [edge, side] = stripCorner(rotation, insets)
  const [x, y] = edge === "left" || edge === "right" ? [edge, side] : [side, edge]
  return { x, y } as { x: "left" | "right"; y: "top" | "bottom" }
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
const $faded: ViewStyle = { opacity: 0.3 }
const $aboveShadow: ViewStyle = { zIndex: TAKEOVER_LAYERS.controls }
