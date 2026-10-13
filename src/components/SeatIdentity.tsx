import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { useElapsedSince } from "@/utils/useElapsedSince"

import { MARK_ART_BOUNDS, MARK_VIEW_BOX, PlayerMark } from "./PlayerMark"
import { Text, type TextProps } from "./Text"
import { shapeForSeat, type PlayerMarkShape } from "../../convex/lib/appearance"

const SEAT_IDENTITY = {
  regular: { mark: 64, name: "md", gap: 8, edge: 16 },
  compact: { mark: 48, name: "sm", gap: 6, edge: 12 },
} as const satisfies Record<
  string,
  { mark: number; name: TextProps["size"]; gap: number; edge: number }
>

export function seatIdentityMetrics(compact?: boolean) {
  return compact ? SEAT_IDENTITY.compact : SEAT_IDENTITY.regular
}

export function seatIdentityBottomGap(edge: number, inset: number) {
  return inset > 0 ? edge / 2 : edge
}

export function seatMarkArt(shape: PlayerMarkShape, compact?: boolean) {
  const scale = seatIdentityMetrics(compact).mark / MARK_VIEW_BOX
  const art = MARK_ART_BOUNDS[shape]
  return {
    height: (art.bottom - art.top) * scale,
    trim: {
      marginTop: -art.top * scale,
      marginBottom: -(MARK_VIEW_BOX - art.bottom) * scale,
      marginLeft: -art.left * scale,
      marginRight: -(MARK_VIEW_BOX - art.right) * scale,
    } satisfies ViewStyle,
  }
}

const PLAYER_MARK_MUTED_OPACITY = 0.72

export interface SeatIdentityProps {
  seatNumber: number
  playerName: string
  shape?: PlayerMarkShape
  color: string
  compact?: boolean
  spinning?: boolean
  insetSwordColor?: string
  staleSince?: number
  style?: StyleProp<ViewStyle>
}

/** why: the name is hidden from screen readers because every seat already announces "Seat N, name" on its card or controls. */
export function SeatIdentity({
  seatNumber,
  playerName,
  shape,
  color,
  compact,
  spinning,
  insetSwordColor,
  staleSince,
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
        spinning={spinning}
        insetSwordColor={insetSwordColor}
        size={metrics.mark}
        style={[$mark, art.trim]}
      />
      <View testID={`life-status-seat-${seatNumber}`} style={$text}>
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
        {staleSince !== undefined ? <UpdatedAgo since={staleSince} color={color} /> : null}
      </View>
    </View>
  )
}

function UpdatedAgo({ since, color }: { since: number; color: string }) {
  const elapsed = useElapsedSince(since)
  return (
    <Text
      text={`Updated ${elapsed} ago`}
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
const $text: ViewStyle = { flexShrink: 1, alignItems: "flex-start" }
const $status: TextStyle = { opacity: 0.9 }
