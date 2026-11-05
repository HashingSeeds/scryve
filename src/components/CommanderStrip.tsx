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
import {
  PulseRing,
  shadowReached,
  TAKEOVER_LAYERS,
  type CommanderFlood,
} from "./CommanderDamageCardControls"
import { floodGap, type CommanderBoardSeat } from "./commanderDamageLayout"
import { overlayTint } from "./LifeControls"
import {
  cornerOffset,
  type LifeCardEdge,
  type LifeCardScreenEdges,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
} from "./playerCardTypes"
import { PlayerMark } from "./PlayerMark"
import { seatIdentityMetrics } from "./SeatIdentity"
import { Text } from "./Text"
import { targetSlop } from "./touchTarget"

// why: the own cell carries the seat's mark with its sword so the grid reads as the way to start an attack, and the cells are big enough for the sword to read.
const DISC_SIZE = 32
const COMPACT_DISC_SIZE = 22

export interface CommanderStripProps {
  seatNumber: number
  identity: string
  ownerPlayerId: PlayerId
  players: readonly CommanderBoardPlayer[]
  seats: readonly CommanderBoardSeat[]
  incoming: Record<PlayerId, number>
  lethal: number
  foreground: string
  /** why: the seat's own color, cut into its mark as the sword. */
  cardColor: string
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  screenEdges?: LifeCardScreenEdges
  compact?: boolean
  disabled?: boolean
  attack?: CommanderStripAttack
  source?: CommanderStripSource
  markAnchor?: { x: number; y: number; size: number }
  onBoundsChange?: (bounds: LayoutRectangle) => void
  onPress?: () => void
}

/** why: while a commander attacks this seat, the strip stays over the shadow with that attacker's total lit and the rest faded, and taps fall through to the hit target. The look eases in as the shadow's edge reaches the strip and back out as it drains, so the card passes the attack on until its flood has drained. With no `wave` the look is fully on. */
export type CommanderStripAttack = {
  attackerId: PlayerId
  wave?: SharedValue<number>
  flood?: CommanderFlood
}

/** why: the attacker's own grid finishes the attack it opened, so its own cell turns into the finish X, or the check that sends held hits. `flight` runs from 0 to 1 as the attack opens and back as it closes. */
export type CommanderStripSource = {
  active: boolean
  flight: SharedValue<number>
  submit: "send" | "done"
  acted: boolean
  onSubmit: () => void
}

export function commanderDamageDealers(
  players: readonly CommanderBoardPlayer[],
  ownerPlayerId: PlayerId,
  incoming: Record<PlayerId, number>,
) {
  return players.filter(({ id }) => id !== ownerPlayerId && (incoming[id] ?? 0) > 0)
}

/** why: a seat shows its grid in place of its mark and name once it has taken commander damage, and for as long as an attack it is part of runs. */
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

export type CommanderDamageTier = "calm" | "significant" | "nearLethal"

/** why: one attacker's total reads on its cell's ring alone, orange from half of lethal and oxblood within five of it, so a crowded grid gains no extra marks. */
export function commanderDamageTier(total: number, lethal: number): CommanderDamageTier {
  if (total >= lethal - NEAR_LETHAL_MARGIN) return "nearLethal"
  if (total >= Math.ceil(lethal / 2)) return "significant"
  return "calm"
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
  cardColor,
  contentRotation,
  contentInsets,
  screenEdges,
  compact,
  disabled,
  attack,
  source,
  markAnchor,
  onPress,
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
  const ownMarkSize = Math.round(disc * OWN_MARK_SCALE)
  const pad = spacing.xxs
  const cellGap = spacing.xxxs
  const glyphRotation: ViewStyle = { transform: [{ rotate: `${contentRotation}deg` }] }
  const dealt = commanderDamageDealers(players, ownerPlayerId, incoming)
  const boardRows = Array.from(new Set(seats.map(({ row }) => row)))
    .sort((a, b) => a - b)
    .map((row) => seats.filter((seat) => seat.row === row).sort((a, b) => a.column - b.column))
  const corner = STRIP_CORNER[contentRotation]
  const offsets = stripEdge(
    corner,
    seatIdentityMetrics(compact).edge - pad,
    contentInsets,
    screenEdges,
  )
  const attackerId = attack?.attackerId
  const flood = attack?.flood
  const sourceShown = !!source
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
  // why: a seat no one has damaged grows its grid out of its mark only for the attack, and folds it back after.
  const attackOnly = dealt.length === 0
  const grow: Grow = { attackOnly, lit, flight: source?.flight }
  const ownCell = ownCellCenter(boardRows, ownerPlayerId, { disc, gap: cellGap, pad })
  const flightFrom =
    markAnchor && ownCell && stripBounds && mapBounds
      ? {
          x: markAnchor.x - (stripBounds.x + mapBounds.x + ownCell.x),
          y: markAnchor.y - (stripBounds.y + mapBounds.y + ownCell.y),
          scale: markAnchor.size / ownMarkSize,
        }
      : undefined
  const measured = !!(stripBounds && mapBounds)
  const flightStyle = useAnimatedStyle(() => {
    const amount = grownAt(grow)
    if (!flightFrom) return { opacity: measured ? 1 : 0, transform: [] }
    return {
      opacity: 1,
      transform: [
        { translateX: flightFrom.x * (1 - amount) },
        { translateY: flightFrom.y * (1 - amount) },
        { scale: flightFrom.scale + (1 - flightFrom.scale) * amount },
      ],
    }
  })
  if (attackOnly && !attackerId && !sourceShown) return null
  const attackerName = players.find(({ id }) => id === attackerId)?.name
  const sources = dealt
    .map((player) =>
      translate("board:commander.amountFrom", {
        amount: incoming[player.id],
        name: player.name,
      }),
    )
    .join(", ")
  const finishing = source?.active

  return (
    <Animated.View
      testID={`commander-strip-seat-${seatNumber}`}
      onLayout={(event) => setStripBounds(event.nativeEvent.layout)}
      pointerEvents={attackerId ? "none" : "box-none"}
      style={[
        themed($strip),
        offsets,
        { flexDirection: stripDirection(contentRotation) },
        (attackerId || sourceShown) && $aboveShadow,
      ]}
    >
      <BoardPressable
        testID={
          finishing ? `commander-exit-seat-${seatNumber}` : `commander-map-seat-${seatNumber}`
        }
        onLayout={(event) => setMapBounds(event.nativeEvent.layout)}
        accessibilityRole="button"
        accessibilityLabel={
          finishing
            ? translate(`board:commander.submitAssigningFromSeat.${source.submit}`, {
                seat: seatNumber,
              })
            : dealt.length
              ? translate("board:commander.assignFromWithDamage", { identity, sources })
              : translate("board:commander.assignFrom", { identity })
        }
        accessibilityState={{ disabled: !!disabled && !finishing }}
        accessible={!attackerId}
        disabled={finishing ? false : disabled || !!attackerId || sourceShown}
        hitSlop={
          mapBounds
            ? targetSlop(
                mapBounds,
                { [corner[0]]: offsets[corner[0]], [corner[1]]: offsets[corner[1]] },
                8,
              )
            : 8
        }
        onPress={finishing ? source.onSubmit : onPress}
        style={({ pressed }) => [themed($map), pressed && { opacity: 0.72 }]}
      >
        {boardRows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            pointerEvents="none"
            accessibilityElementsHidden={!attackerId}
            importantForAccessibility={attackerId ? "auto" : "no-hide-descendants"}
            style={themed($mapRow)}
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
                    style={[themed($ownSeat), size, $aboveCells]}
                  >
                    <Animated.View
                      style={[$ownGlyph, { margin: (disc - ownMarkSize) / 2 }, flightStyle]}
                    >
                      <OwnGlyph
                        seatNumber={playerIndex + 1}
                        shape={player.shape}
                        color={foreground}
                        insetSwordColor={cardColor}
                        rotation={contentRotation}
                        size={ownMarkSize}
                        grow={grow}
                        finish={finishing ? source.submit : undefined}
                      />
                    </Animated.View>
                    {finishing && source.acted ? (
                      <PulseRing
                        testID={`commander-finish-pulse-seat-${seatNumber}`}
                        size={disc + 8}
                        from={0.6}
                        color={foreground}
                      />
                    ) : null}
                  </Eased>
                )
              const total = incoming[playerId] ?? 0
              const ink = accessibleForeground(player.color)
              const attacking = playerId === attackerId
              const restOpacity = sourceShown ? FADED_OPACITY : total === 0 ? IDLE_OPACITY : 1
              const tier = commanderDamageTier(total, lethal)
              const restBorder =
                tier === "calm" ? overlayTint(foreground, RIM_ALPHA) : TIER_RING[tier]
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
                      ? { opacity: 1, border: tier === "calm" ? foreground : restBorder }
                      : attackerId
                        ? { opacity: FADED_OPACITY, border: restBorder }
                        : { opacity: restOpacity, border: restBorder }
                  }
                  style={[
                    themed($disc),
                    size,
                    { backgroundColor: player.color },
                    tier !== "calm" && $tierDisc,
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
              return (
                <Grown key={playerId} grow={grow}>
                  {attacking ? <Pop value={total}>{pip}</Pop> : pip}
                </Grown>
              )
            })}
          </View>
        ))}
      </BoardPressable>
    </Animated.View>
  )
}, structurallyEqual)

/** why: the own cell's center inside the map, from the same disc, gap, and padding the map lays out with, so the flight lands before the cell could report its own layout. Rows are centered, so a short row starts in by half its missing cells. */
function ownCellCenter(
  rows: readonly (readonly CommanderBoardSeat[])[],
  ownerPlayerId: PlayerId,
  { disc, gap, pad }: { disc: number; gap: number; pad: number },
) {
  const widest = Math.max(...rows.map((row) => row.length))
  const step = disc + gap
  for (const [rowIndex, row] of rows.entries()) {
    const column = row.findIndex(({ playerId }) => playerId === ownerPlayerId)
    if (column < 0) continue
    return {
      x: pad + ((widest - row.length) * step) / 2 + column * step + disc / 2,
      y: pad + rowIndex * step + disc / 2,
    }
  }
  return undefined
}

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

/** why: the own cell holds the seat's mark with its sword, and on the attacker's card the sword gives way to the finish X or check once the mark has landed. */
function OwnGlyph({
  finish,
  grow,
  ...mark
}: ComponentProps<typeof PlayerMark> & { grow: Grow; finish?: "send" | "done" }) {
  const markStyle = useAnimatedStyle(() => ({
    opacity: finish ? 1 - landedAt(grownAt(grow)) : 1,
  }))
  const finishStyle = useAnimatedStyle(() => ({ opacity: landedAt(grownAt(grow)) }))
  return (
    <>
      <Animated.View style={markStyle}>
        <PlayerMark {...mark} />
      </Animated.View>
      {finish ? (
        <Animated.View
          testID={`commander-exit-${finish === "send" ? "check" : "x"}-seat-${mark.seatNumber}`}
          style={[$overlaid, finishStyle]}
        >
          <PlayerMark {...mark} closeIcon={finish === "done"} insetCheck={finish === "send"} />
        </Animated.View>
      ) : null}
    </>
  )
}

/** why: how far a seat's grid has grown out of its mark, from 0 to 1. A damaged seat's grid is always fully grown; otherwise it follows the attacker's own flight or the shadow reaching this seat. */
type Grow = { attackOnly: boolean; lit: Lit; flight?: SharedValue<number> }

function grownAt({ attackOnly, lit, flight }: Grow) {
  "worklet"
  if (!attackOnly) return 1
  return flight ? flight.value : litAt(lit)
}

// why: worklets capture their closure when the module loads, so constants they read are declared above them.
const LANDED_FROM = 0.75

function landedAt(amount: number) {
  "worklet"
  return Math.min(Math.max((amount - LANDED_FROM) / (1 - LANDED_FROM), 0), 1)
}

/** why: the other cells grow in around the landing mark rather than sitting there before it arrives. */
function Grown({ grow, children }: { grow: Grow; children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    const amount = Math.min(Math.max((grownAt(grow) - GROW_FROM) / (1 - GROW_FROM), 0), 1)
    return {
      opacity: amount,
      transform: [{ scale: GROWN_START_SCALE + (1 - GROWN_START_SCALE) * amount }],
    }
  })
  return <Animated.View style={style}>{children}</Animated.View>
}

function stripDirection(rotation: LifeCardContentRotation): ViewStyle["flexDirection"] {
  if (rotation === 90) return "column"
  if (rotation === -90) return "column-reverse"
  if (rotation === 180) return "row-reverse"
  return "row"
}

/** why: the grid takes the corner the seat's mark and name sit in: the edge, the side it starts from, and the side that bounds its run. */
const STRIP_CORNER = {
  0: ["bottom", "left", "right"],
  180: ["top", "right", "left"],
  90: ["left", "top", "bottom"],
  [-90]: ["right", "bottom", "top"],
} as const satisfies Record<LifeCardContentRotation, readonly LifeCardEdge[]>

/** why: the card corner the strip sits in, so other corner controls can keep clear of it. */
export function commanderStripCorner(rotation: LifeCardContentRotation) {
  const [edge, side] = STRIP_CORNER[rotation]
  const [x, y] = edge === "left" || edge === "right" ? [edge, side] : [side, edge]
  return { x, y } as { x: "left" | "right"; y: "top" | "bottom" }
}

function stripEdge(
  [edge, side, end]: (typeof STRIP_CORNER)[LifeCardContentRotation],
  gap: number,
  insets?: LifeCardContentInsets,
  screenEdges?: LifeCardScreenEdges,
): Partial<Record<LifeCardEdge, number>> {
  return {
    [edge]: cornerOffset(gap, edge, side, insets, screenEdges),
    [side]: cornerOffset(gap, side, edge, insets, screenEdges),
    [end]: gap + (insets?.[end] ?? 0),
  }
}

const $strip: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 10,
  justifyContent: "flex-start",
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

const $tierDisc: ViewStyle = { borderWidth: 2 }

const $count: ThemedStyle<TextStyle> = () => ({
  fontSize: 16,
  lineHeight: 20,
  fontVariant: ["tabular-nums"],
})

const $compactCount: ThemedStyle<TextStyle> = () => ({
  fontSize: 13,
  lineHeight: 16,
  fontVariant: ["tabular-nums"],
})

const $ownSeat: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
})

const $ownGlyph: ViewStyle = { alignItems: "center", justifyContent: "center" }
// why: the landing mark flies over its neighbours, so its cell draws above theirs.
const $aboveCells: ViewStyle = { zIndex: 1 }
const $overlaid: ViewStyle = {
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
}
const IDLE_OPACITY = 0.45
// why: the lowest rim that, drawn over any attacker's disc, keeps 3:1 against every seat color, so each disc stands off its card.
const RIM_ALPHA = 0.75
// why: the own cell is where the seat's mark lands, so it keeps the mark's muted look instead of fading like a cell.
const OWN_OPACITY = 0.72
// why: a mark's art fills about 55% of its box, so the box outgrows the cell for the art to match the discs beside it.
const OWN_MARK_SCALE = 1.6
const NEAR_LETHAL_MARGIN = 5
const TIER_RING = { significant: "#FF8A1F", nearLethal: "#8E1B2C" } as const
const GROW_FROM = 0.35
const GROWN_START_SCALE = 0.6
const FADED_OPACITY = 0.3
const $aboveShadow: ViewStyle = { zIndex: TAKEOVER_LAYERS.controls }
