import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { translate } from "@/i18n/translate"
import { useElapsedSince } from "@/utils/useElapsedSince"

import type { LifeCardEdge } from "./playerCardTypes"
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

// why: the home indicator draws inside its inset, so the pair keeps half its gap above it; a camera cutout's inset already ends clear of the cutout, so the pair sits right on it.
export function seatIdentityBottomGap(edge: number, inset: number, screenEdge: LifeCardEdge) {
  if (inset === 0) return edge
  return screenEdge === "bottom" ? edge / 2 : 0
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
        size={metrics.mark}
        style={[$mark, art.trim]}
      />
      <View testID={`life-status-seat-${seatNumber}`} style={$text}>
        {markOnly ? null : (
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
        )}
        {staleSince !== undefined ? <UpdatedAgo since={staleSince} color={color} /> : null}
      </View>
    </View>
  )
}

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
const $text: ViewStyle = { flexShrink: 1, alignItems: "flex-start" }
const $status: TextStyle = { opacity: 0.9 }
