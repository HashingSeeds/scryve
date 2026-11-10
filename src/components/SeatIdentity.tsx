import type { ComponentProps } from "react"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig } from "react-native-reanimated"

import { translate } from "@/i18n/translate"
import { useElapsedSince } from "@/utils/useElapsedSince"

import { MARK_ART_BOUNDS, MARK_VIEW_BOX, PlayerMark } from "./PlayerMark"
import { Text, type TextProps } from "./Text"
import { shapeForSeat, type PlayerMarkShape } from "../../convex/lib/appearance"

// why: the mark, dice bag, and calculator all draw `icon` tall, so a seat's bottom row reads as one band.
const SEAT_IDENTITY = {
  regular: { icon: 32, name: "md", gap: 8, edge: 16 },
  compact: { icon: 24, name: "sm", gap: 6, edge: 12 },
} as const satisfies Record<
  string,
  { icon: number; name: TextProps["size"]; gap: number; edge: number }
>

export function seatIdentityMetrics(compact?: boolean) {
  return compact ? SEAT_IDENTITY.compact : SEAT_IDENTITY.regular
}

// why: a safe-area inset already keeps clear of the home indicator's swipe strip or a camera cutout, so the pair sits right on it, as the HIG places a bottom toolbar.
export function seatIdentityBottomGap(edge: number, inset: number) {
  return inset === 0 ? edge : 0
}

export function seatMarkArt(shape: PlayerMarkShape, compact?: boolean) {
  const art = MARK_ART_BOUNDS[shape]
  const height = seatIdentityMetrics(compact).icon
  const scale = height / (art.bottom - art.top)
  return {
    size: MARK_VIEW_BOX * scale,
    width: (art.right - art.left) * scale,
    height,
    trim: {
      marginTop: -art.top * scale,
      marginBottom: -(MARK_VIEW_BOX - art.bottom) * scale,
      marginLeft: -art.left * scale,
      marginRight: -(MARK_VIEW_BOX - art.right) * scale,
    } satisfies ViewStyle,
  }
}

const PLAYER_MARK_MUTED_OPACITY = 0.72

export function seatIdentityLabel(seatNumber: number, playerName: string) {
  return translate("board:seat.identity", {
    seat: seatNumber,
    name: playerName.trim() || translate("board:seat.unnamedPlayer"),
  })
}

export interface SeatIdentityProps {
  seatNumber: number
  playerName: string
  shape?: PlayerMarkShape
  color: string
  compact?: boolean
  insetSwordColor?: string
  foil?: boolean
  staleSince?: number
  markOnly?: boolean
  nameRetracted?: boolean
  markHidden?: boolean
  nameStyle?: ComponentProps<typeof Animated.View>["style"]
  style?: StyleProp<ViewStyle>
}

/** why: the name is hidden from screen readers because every seat already announces "Seat N, name" on its card or controls. */
export function SeatIdentity({
  seatNumber,
  playerName,
  shape,
  color,
  compact,
  insetSwordColor,
  foil,
  staleSince,
  markOnly,
  nameRetracted,
  markHidden,
  nameStyle,
  style,
}: SeatIdentityProps) {
  const metrics = seatIdentityMetrics(compact)
  const art = seatMarkArt(shape ?? shapeForSeat(seatNumber), compact)
  return (
    <View testID={`seat-identity-seat-${seatNumber}`} style={[$row, { gap: metrics.gap }, style]}>
      <PlayerMark
        seatNumber={seatNumber}
        shape={shape}
        color={color}
        insetSwordColor={insetSwordColor}
        foil={foil}
        size={art.size}
        style={[$mark, art.trim, markHidden && $hidden]}
      />
      <Animated.View testID={`life-status-seat-${seatNumber}`} style={[$text, nameStyle]}>
        <LayoutAnimationConfig skipEntering>
          {markOnly || nameRetracted ? null : (
            <Animated.View entering={NAME_IN} exiting={NAME_OUT}>
              <Text
                testID={`player-name-seat-${seatNumber}`}
                text={playerName}
                accessible={false}
                size={metrics.name}
                weight="medium"
                maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={{ color }}
              />
            </Animated.View>
          )}
        </LayoutAnimationConfig>
        {staleSince !== undefined ? <UpdatedAgo since={staleSince} color={color} /> : null}
      </Animated.View>
    </View>
  )
}

const NAME_IN = FadeIn.duration(200)
const NAME_OUT = FadeOut.duration(140)

function UpdatedAgo({ since, color }: { since: number; color: string }) {
  const elapsed = useElapsedSince(since)
  return (
    <Text
      text={translate("board:seat.updatedAgo", { elapsed })}
      weight="bold"
      size="xxs"
      maxFontSizeMultiplier={1.3}
      numberOfLines={1}
      style={[$status, { color }]}
    />
  )
}

const $row: ViewStyle = { flexDirection: "row", alignItems: "center" }
const $mark: ViewStyle = { opacity: PLAYER_MARK_MUTED_OPACITY }
const $hidden: ViewStyle = { opacity: 0 }
const $text: ViewStyle = { flexShrink: 1, alignItems: "flex-start" }
const $status: TextStyle = { opacity: 0.9 }
