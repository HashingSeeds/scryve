import { memo, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import type { LayoutRectangle, TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated"

import type { CommanderBoardPlayer, PlayerId } from "@/features/game/types"
import { formatList } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground, contrastRatio } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { shadowReached, TAKEOVER_LAYERS, type CommanderFlood } from "./CommanderDamageCardControls"
import { floodGap, type CommanderBoardSeat } from "./commanderDamageLayout"
import { menuCornerStep } from "./GameRadialMenu"
import { overlayTint } from "./LifeControls"
import {
  cornerOffset,
  type LifeCardEdge,
  type LifeCardMenuCorner,
  type LifeCardScreenEdges,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
} from "./playerCardTypes"
import { PlayerMark } from "./PlayerMark"
import { seatIdentityMetrics } from "./SeatIdentity"
import { Text } from "./Text"

// why: on a 4-player phone seat the grid still ends short of the − at the middle of its end.
const CELL_SIZE = 26
const COMPACT_CELL_SIZE = 22

export interface CommanderStripProps {
  seatNumber: number
  identity: string
  ownerPlayerId: PlayerId
  players: readonly CommanderBoardPlayer[]
  seats: readonly CommanderBoardSeat[]
  incoming: Record<PlayerId, number>
  /** why: each partner's total for an attacker whose partners have both dealt damage here, since lethal counts per commander. */
  split?: Record<PlayerId, readonly number[]>
  lethal: number
  foreground: string
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  screenEdges?: LifeCardScreenEdges
  menuCorner?: LifeCardMenuCorner
  compact?: boolean
  /** why: a team zone's names hold its top corners, so its grid keeps to the foot, `from` along it when centered in the team's row. */
  foot?: { from?: number }
  attack?: CommanderStripAttack
  onBoundsChange?: (bounds: LayoutRectangle) => void
  /** why: the Watch board draws the grid at its screen's scale and places it in its tile itself, outside any seat corner. */
  standalone?: { cell: number }
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

export function commanderGridShown({
  players,
  ownerPlayerId,
  incoming,
  attacked,
}: {
  players: readonly CommanderBoardPlayer[]
  ownerPlayerId: PlayerId
  incoming: Record<PlayerId, number>
  attacked: boolean
}) {
  return attacked || commanderDamageDealers(players, ownerPlayerId, incoming).length > 0
}

export function chipTotals(total: number, split?: readonly number[]) {
  const dealt = split?.filter((amount) => amount > 0) ?? []
  return dealt.length > 1 ? dealt : [total]
}

export type CommanderDamageTier = "calm" | "significant" | "nearLethal"

/** why: one attacker's total reads on its cell alone, a solid rim from half of lethal and a filled cell within five of it, both in the seat's own ink so they read on every seat color and a crowded grid gains no extra marks. */
export function commanderDamageTier(total: number, lethal: number): CommanderDamageTier {
  if (total >= lethal - NEAR_LETHAL_MARGIN) return "nearLethal"
  if (total >= Math.ceil(lethal / 2)) return "significant"
  return "calm"
}

/** why: the grid mirrors the board, one square per seat, in the corner opposite the seat's name; partners that have both dealt damage share their square, cut across. */
export const CommanderStrip = memo(function CommanderStrip({
  seatNumber,
  identity,
  ownerPlayerId,
  players,
  seats,
  incoming,
  split,
  lethal,
  foreground,
  contentRotation,
  contentInsets,
  screenEdges,
  menuCorner,
  compact,
  foot,
  attack,
  onBoundsChange,
  standalone,
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
  const cell = standalone?.cell ?? (compact ? COMPACT_CELL_SIZE : CELL_SIZE)
  const scale = standalone ? standalone.cell / CELL_SIZE : 1
  const pad = spacing.xxs * scale
  const gap = standalone && { gap: spacing.xxxs * scale }
  // why: the Watch board's last row starts at the left, so its grid's does too.
  const rowStart = standalone && { justifyContent: "flex-start" as const }
  const turned: ViewStyle = { transform: [{ rotate: `${contentRotation}deg` }] }
  const dealt = commanderDamageDealers(players, ownerPlayerId, incoming)
  const boardRows = Array.from(new Set(seats.map(({ row }) => row)))
    .sort((a, b) => a - b)
    .map((row) => seats.filter((seat) => seat.row === row).sort((a, b) => a.column - b.column))
  const corner = (foot ? FOOT_CORNER : HEAD_CORNER)[contentRotation]
  const placed = standalone
    ? undefined
    : [
        themed($strip),
        stripEdge(corner, seatIdentityMetrics(compact).edge - pad, {
          insets: contentInsets,
          screenEdges,
          from: foot?.from,
          menu: foot ? 0 : menuCornerStep(menuCorner, corner[0], corner[1], compact),
        }),
      ]
  const attackerId = attack?.attackerId
  const flood = attack?.flood
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
  // why: a grid shown only for this attack eases in with the shadow and out as it drains.
  const attackOnly = dealt.length === 0
  if (attackOnly && !attackerId) return null
  const attackerName = players.find(({ id }) => id === attackerId)?.name
  const chips = (playerId: PlayerId) => chipTotals(incoming[playerId] ?? 0, split?.[playerId])
  const sources = formatList(
    dealt.flatMap((player) =>
      chips(player.id).map((amount, index) =>
        translate(index > 0 ? "board:commander.amountFromPartner" : "board:commander.amountFrom", {
          amount,
          name: player.name,
        }),
      ),
    ),
  )
  const radius = Math.round(cell * CELL_RADIUS)

  return (
    <Animated.View
      testID={`commander-strip-seat-${seatNumber}`}
      onLayout={(event) => setStripBounds(event.nativeEvent.layout)}
      pointerEvents="none"
      style={[
        placed,
        { flexDirection: stripDirection(contentRotation) },
        attackerId && $aboveShadow,
      ]}
    >
      <Eased
        testID={`commander-map-seat-${seatNumber}`}
        onLayout={(event) => setMapBounds(event.nativeEvent.layout)}
        accessible={!attackerId}
        accessibilityLabel={
          attackerId
            ? undefined
            : translate("board:counters.seatItem", { identity, label: sources })
        }
        lit={lit}
        rest={attackOnly ? 0 : 1}
        attacked={1}
        style={[themed($map), { padding: pad }, gap]}
      >
        {boardRows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            accessibilityElementsHidden={!attackerId}
            importantForAccessibility={attackerId ? "auto" : "no-hide-descendants"}
            style={[themed($mapRow), gap, rowStart]}
          >
            {row.map(({ playerId }) => {
              const playerIndex = players.findIndex(({ id }) => id === playerId)
              const player = players[playerIndex]
              if (!player) return null
              const size = { width: cell, height: cell }
              if (playerId === ownerPlayerId)
                return (
                  <Eased
                    key={playerId}
                    testID={`commander-own-seat-${seatNumber}`}
                    lit={lit}
                    rest={OWN_OPACITY}
                    attacked={FADED_OPACITY}
                    style={[$cell, size]}
                  >
                    <PlayerMark
                      seatNumber={playerIndex + 1}
                      shape={player.shape}
                      color={foreground}
                      rotation={contentRotation}
                      size={Math.round(cell * OWN_MARK_SCALE)}
                    />
                  </Eased>
                )
              const attacking = playerId === attackerId
              const totals = chips(playerId)
              const partners = totals.length > 1
              const half = partners ? (cell - HALF_GAP * scale) / 2 : cell
              const halves = totals.map((total, index) => {
                const partner = index > 0
                const tier = commanderDamageTier(total, lethal)
                const filled = tier === "nearLethal"
                const rim = (tier === "calm" ? 1 : RIM_WIDTH) * scale
                const count = StyleSheet.flatten([
                  themed(compact ? $compactCount : $count),
                  partners && (compact ? $compactPartnerCount : $partnerCount),
                  total > 99 && (compact ? $compactThreeDigits : $threeDigits),
                ])
                const ends = partners
                  ? partner
                    ? { borderBottomLeftRadius: radius, borderBottomRightRadius: radius }
                    : { borderTopLeftRadius: radius, borderTopRightRadius: radius }
                  : { borderRadius: radius }
                return (
                  <View
                    key={index}
                    testID={`commander-pip-seat-${seatNumber}-${playerId}${partner ? "-partner" : ""}`}
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
                      $half,
                      ends,
                      {
                        height: half,
                        borderWidth: rim,
                        borderColor:
                          tier === "calm" ? overlayTint(foreground, RIM_ALPHA) : foreground,
                        backgroundColor: filled ? foreground : player.color,
                      },
                      partners && (partner ? $cutTop : $cutBottom),
                    ]}
                  >
                    <Text
                      testID={
                        attacking
                          ? `commander-total-seat-${seatNumber}${partner ? "-partner" : ""}`
                          : undefined
                      }
                      text={total}
                      weight="bold"
                      maxFontSizeMultiplier={1}
                      style={[
                        count,
                        standalone && {
                          fontSize: (count.fontSize ?? 0) * scale,
                          lineHeight: (count.lineHeight ?? 0) * scale,
                        },
                        {
                          color: !filled
                            ? accessibleForeground(player.color)
                            : contrastRatio(player.color, foreground) >= FILLED_COUNT_CONTRAST
                              ? player.color
                              : accessibleForeground(foreground),
                        },
                      ]}
                    />
                  </View>
                )
              })
              const square = (
                <View style={[size, partners && { gap: HALF_GAP * scale }, turned]}>{halves}</View>
              )
              return (
                <Eased
                  key={playerId}
                  lit={lit}
                  rest={1}
                  attacked={attacking ? 1 : FADED_OPACITY}
                  style={size}
                >
                  {attacking ? (
                    <>
                      <Eased
                        testID={`commander-lit-seat-${seatNumber}`}
                        lit={lit}
                        rest={0}
                        attacked={1}
                        style={[
                          $litRing,
                          { borderRadius: radius + LIT_GAP, borderColor: foreground },
                        ]}
                      />
                      <Pop value={totals.reduce((sum, total) => sum + total, 0)}>{square}</Pop>
                    </>
                  ) : (
                    square
                  )}
                </Eased>
              )
            })}
          </View>
        ))}
      </Eased>
    </Animated.View>
  )
}, structurallyEqual)

// why: the small grid eases over more of the shadow's travel than its edge takes to cross the grid; a quick edge would flip it in one frame.
const LIT_SPAN = 192

type Lit = { attacked: boolean; wave?: SharedValue<number>; flood?: CommanderFlood; gap: number }

function litAt({ attacked, wave, flood, gap }: Lit) {
  "worklet"
  if (!wave) return attacked ? 1 : 0
  return flood ? shadowReached(flood, wave.value, gap, LIT_SPAN) : wave.value
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

type StripCorner = readonly [LifeCardEdge, LifeCardEdge, LifeCardEdge]

/** why: the grid takes the corner it reads from: the edge, the side it starts from, and the side that bounds its run, in the card's own edges for each turn of its content. Seats keep it at the head, opposite the name; team zones keep it at the foot. */
const HEAD_CORNER = {
  0: ["top", "left", "right"],
  180: ["bottom", "right", "left"],
  90: ["right", "top", "bottom"],
  [-90]: ["left", "bottom", "top"],
} as const satisfies Record<LifeCardContentRotation, StripCorner>

const FOOT_CORNER = {
  0: ["bottom", "left", "right"],
  180: ["top", "right", "left"],
  90: ["left", "top", "bottom"],
  [-90]: ["right", "bottom", "top"],
} as const satisfies Record<LifeCardContentRotation, StripCorner>

export function commanderStripCorner(rotation: LifeCardContentRotation) {
  const [edge, side] = HEAD_CORNER[rotation]
  const [x, y] = edge === "left" || edge === "right" ? [edge, side] : [side, edge]
  return { x, y } as { x: "left" | "right"; y: "top" | "bottom" }
}

function stripEdge(
  [edge, side, end]: StripCorner,
  gap: number,
  {
    insets,
    screenEdges,
    from,
    menu,
  }: {
    insets?: LifeCardContentInsets
    screenEdges?: LifeCardScreenEdges
    from?: number
    menu: number
  },
): Partial<Record<LifeCardEdge, number>> {
  return {
    [edge]:
      from === undefined
        ? cornerOffset(gap, edge, side, insets, screenEdges)
        : gap + (insets?.[edge] ?? 0),
    [side]: from ?? cornerOffset(gap, side, edge, insets, screenEdges) + menu,
    [end]: gap + (insets?.[end] ?? 0),
  }
}

const $strip: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 10,
  justifyContent: "flex-start",
  alignItems: "center",
})

const $map: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxxs,
})

const $mapRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.xxxs,
})

const $cell: ViewStyle = { alignItems: "center", justifyContent: "center" }
const $half: ViewStyle = { alignItems: "center", justifyContent: "center", overflow: "hidden" }
// why: a partner half has no rim along the cut, so the pair reads as one square.
const $cutTop: ViewStyle = { borderTopWidth: 0 }
const $cutBottom: ViewStyle = { borderBottomWidth: 0 }

const $count: ThemedStyle<TextStyle> = () => ({
  fontSize: 15,
  lineHeight: 19,
  fontVariant: ["tabular-nums"],
})

const $compactCount: ThemedStyle<TextStyle> = () => ({
  fontSize: 12,
  lineHeight: 15,
  fontVariant: ["tabular-nums"],
})

const $partnerCount: TextStyle = { fontSize: 11, lineHeight: 12 }
const $compactPartnerCount: TextStyle = { fontSize: 9, lineHeight: 10 }
const $threeDigits: TextStyle = { fontSize: 11 }
const $compactThreeDigits: TextStyle = { fontSize: 9 }

// why: the attacker's square gets a ring a step outside it, so it reads lit without changing the total's own rim.
const LIT_GAP = 3
const $litRing: ViewStyle = {
  ...StyleSheet.absoluteFill,
  margin: -LIT_GAP,
  borderWidth: 2,
}

// why: rounded squares, not discs, so a partner pair can share one cut across.
const CELL_RADIUS = 0.27
const HALF_GAP = 1
const RIM_WIDTH = 2.5
// why: lowest rim that keeps 3:1 against every seat color.
const RIM_ALPHA = 0.75
// why: the own cell keeps the mark's muted look.
const OWN_OPACITY = 0.72
// why: a mark's art fills about 55% of its box, so the box outgrows the cell for the art to match the squares beside it.
const OWN_MARK_SCALE = 1.5
const NEAR_LETHAL_MARGIN = 5
const FILLED_COUNT_CONTRAST = 4.5
const FADED_OPACITY = 0.3
const $aboveShadow: ViewStyle = { zIndex: TAKEOVER_LAYERS.controls }
