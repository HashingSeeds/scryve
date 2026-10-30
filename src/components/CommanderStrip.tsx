import { memo, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import type { LayoutRectangle, TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated"

import type { CommanderBoardPlayer, PlayerId } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { shadowReached, TAKEOVER_LAYERS, type CommanderFlood } from "./CommanderDamageCardControls"
import { floodGap, type CommanderBoardSeat } from "./commanderDamageLayout"
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
  attack?: CommanderStripAttack
  onBoundsChange?: (bounds: LayoutRectangle) => void
  onToggle: () => void
}

/** why: while a commander attacks this seat, the strip stays over the shadow with that attacker's total lit and the rest faded, and taps fall through to the hit target. The look eases in as the shadow's edge reaches the strip and back out as it drains, so the card passes the attack on until its flood has drained. With no `wave` the look is fully on. */
export type CommanderStripAttack = {
  attackerId: PlayerId
  wave?: SharedValue<number>
  flood?: CommanderFlood
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
  attack,
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
  const attackerId = attack?.attackerId
  const flood = attack?.flood
  // why: the grid is measured from its own center; until it lays out, it changes with the disc.
  const lit: Lit = {
    attacked: !!attackerId,
    wave: attack?.wave,
    flood,
    gap:
      flood && stripBounds && mapBounds
        ? floodGap(flood, {
            x: stripBounds.x + mapBounds.x + mapBounds.width / 2,
            y: stripBounds.y + mapBounds.y + mapBounds.height / 2,
          })
        : (flood?.discGap ?? 0),
  }
  // why: a seat no one has damaged shows its strip only for the attack.
  const attackOnly = dealt.length === 0
  const stripStyle = useAnimatedStyle(() => ({ opacity: attackOnly ? litAt(lit) : 1 }))
  if (attackOnly && !attackerId) return null
  const attackerName = players.find(({ id }) => id === attackerId)?.name

  return (
    <Animated.View
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
        stripStyle,
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
                  <Eased
                    key={playerId}
                    testID={`commander-own-seat-${seatNumber}`}
                    lit={lit}
                    rest={OWN_OPACITY}
                    attacked={attackerId ? FADED_OPACITY : OWN_OPACITY}
                    style={[themed($ownSeat), size]}
                  >
                    <PlayerMark
                      seatNumber={playerIndex + 1}
                      shape={player.shape}
                      color={foreground}
                      rotation={contentRotation}
                      size={Math.round(disc * 0.6)}
                    />
                  </Eased>
                )
              const total = incoming[playerId] ?? 0
              const ink = accessibleForeground(player.color)
              const attacking = playerId === attackerId
              const restOpacity = total === 0 ? IDLE_OPACITY : 1
              const restBorder = total >= lethal ? foreground : overlayTint(foreground, 0.5)
              const count = (
                <Text
                  testID={attacking ? `commander-total-seat-${seatNumber}` : undefined}
                  text={String(total)}
                  weight="bold"
                  maxFontSizeMultiplier={1}
                  style={[themed(compact ? $compactCount : $count), { color: ink }, glyphRotation]}
                />
              )
              const mark = (
                <PlayerMark
                  seatNumber={playerIndex + 1}
                  shape={player.shape}
                  color={ink}
                  rotation={contentRotation}
                  size={Math.round(disc * 0.5)}
                />
              )
              const pip = (
                <Pip
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
                  lit={lit}
                  rest={{ opacity: restOpacity, border: restBorder }}
                  attacked={
                    attacking
                      ? { opacity: 1, border: foreground }
                      : attackerId
                        ? { opacity: FADED_OPACITY, border: restBorder }
                        : { opacity: restOpacity, border: restBorder }
                  }
                  style={[
                    themed($disc),
                    size,
                    { backgroundColor: player.color },
                    total >= lethal && themed($lethalDisc),
                  ]}
                >
                  {total > 0 ? (
                    count
                  ) : attacking ? (
                    // why: an attacker that has dealt nothing yet turns its mark into its 0 as the shadow reaches the strip.
                    <>
                      <Eased lit={lit} rest={1} attacked={0}>
                        {mark}
                      </Eased>
                      <Eased lit={lit} rest={0} attacked={1} style={$overlaid}>
                        {count}
                      </Eased>
                    </>
                  ) : (
                    mark
                  )}
                </Pip>
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
    </Animated.View>
  )
}, structurallyEqual)

// why: the grid is small, so it eases over a longer stretch of the shadow's travel than its edge takes to cross it; a quick edge would flip it in a frame.
const LIT_SPAN = 192

/** why: how far the strip has eased into its attack look, from 0 to 1: as the shadow's edge passes the grid, or at once with no `wave`. */
type Lit = { attacked: boolean; wave?: SharedValue<number>; flood?: CommanderFlood; gap: number }

function litAt({ attacked, wave, flood, gap }: Lit) {
  "worklet"
  if (!wave) return attacked ? 1 : 0
  return flood ? shadowReached(flood, wave.value, gap, LIT_SPAN) : wave.value
}

type PipLook = { opacity: number; border: string }

/** why: a pip eases from its resting look to its attack look as `lit` runs from 0 to 1, so the attacker's brightens and outlines and the rest fade with the passing shadow. */
function Pip({
  lit,
  rest,
  attacked,
  style,
  ...props
}: ComponentProps<typeof Animated.View> & {
  lit: Lit
  rest: PipLook
  attacked: PipLook
}) {
  const look = useAnimatedStyle(() => {
    const amount = litAt(lit)
    return {
      opacity: rest.opacity + (attacked.opacity - rest.opacity) * amount,
      borderColor: interpolateColor(amount, [0, 1], [rest.border, attacked.border]),
    }
  })
  return <Animated.View {...props} style={[style, look]} />
}

function Eased({
  lit,
  rest,
  attacked,
  style,
  ...props
}: ComponentProps<typeof Animated.View> & {
  lit: Lit
  rest: number
  attacked: number
}) {
  const fade = useAnimatedStyle(() => ({ opacity: rest + (attacked - rest) * litAt(lit) }))
  return <Animated.View {...props} style={[style, fade]} />
}

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

const $map: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  gap: spacing.xxxs,
  padding: spacing.xxs,
  borderRadius: radius.md,
})

const $mapRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.xxxs,
})

const $disc: ThemedStyle<ViewStyle> = () => ({
  borderRadius: radius.full,
  borderWidth: 1,
  alignItems: "center",
  justifyContent: "center",
})

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
})

const $hidden: ViewStyle = { opacity: 0 }
const $overlaid: ViewStyle = {
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
}
const IDLE_OPACITY = 0.45
const OWN_OPACITY = 0.35
const FADED_OPACITY = 0.3
const $aboveShadow: ViewStyle = { zIndex: TAKEOVER_LAYERS.controls }
