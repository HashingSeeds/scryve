import { useState } from "react"
import type { ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Svg, { Path } from "react-native-svg"

import { useAppTheme } from "@/theme/context"

import type { LifeCardContentRotation } from "./playerCardTypes"

/** why: two treatments are on trial for showing that two touching cards are one team. `link` joins the totals with a rivet on the seam; `frame` outlines the pair as one card. */
export type TeamBinding = "link" | "frame"

const MENU_CLEARANCE = 48

/** why: a Two-Headed Giant team's two cards touch, and this draws the mark that binds them above the pair. */
export function TeamPanelLayer({
  binding,
  rotation,
  compact,
  seatNumber,
  menuAtSeam,
}: {
  binding: TeamBinding
  rotation: LifeCardContentRotation
  compact?: boolean
  seatNumber: number
  menuAtSeam: boolean
}) {
  const {
    theme: { colors, radius },
  } = useAppTheme()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const rivet = compact ? 24 : 28
  const sideways = Math.abs(rotation) === 90
  const depth = sideways ? size.width : size.height
  const headRun = (sideways ? size.height : size.width) / 2
  const toward = UP[rotation]
  // why: the seam's middle sits between one head's + and the other's −, so the rivet moves toward the table's center, off their line, and further on a narrow head whose total fills the card; it stops short of the menu.
  const wanted = depth * (headRun < depth ? 0.25 : 0.2)
  const shift = Math.max(
    0,
    menuAtSeam ? Math.min(wanted, depth / 2 - MENU_CLEARANCE - rivet / 2) : wanted,
  )
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={({ nativeEvent: { layout } }) =>
        setSize((current) =>
          current.width === layout.width && current.height === layout.height
            ? current
            : { width: layout.width, height: layout.height },
        )
      }
    >
      {binding === "frame" ? (
        <View
          testID={`team-frame-${seatNumber}`}
          style={[
            $frame,
            {
              borderColor: colors.palette.neutral600,
              borderRadius: compact ? radius.xxl : radius.xxxl,
            },
          ]}
        />
      ) : size.width > 0 ? (
        <View style={$center}>
          <View
            testID={`team-link-${seatNumber}`}
            style={[
              $rivet,
              {
                width: rivet,
                height: rivet,
                borderRadius: rivet / 2,
                backgroundColor: colors.background,
                transform: [
                  { translateX: toward.x * shift },
                  { translateY: toward.y * shift },
                  { rotate: `${rotation}deg` },
                ],
              },
            ]}
          >
            <LinkGlyph size={rivet * 0.6} color={colors.textDim} />
          </View>
        </View>
      ) : null}
    </View>
  )
}

const UP: Record<LifeCardContentRotation, { x: number; y: number }> = {
  0: { x: 0, y: -1 },
  180: { x: 0, y: 1 },
  90: { x: 1, y: 0 },
  [-90]: { x: -1, y: 0 },
}

function LinkGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

const $center: ViewStyle = {
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
}
const $rivet: ViewStyle = { alignItems: "center", justifyContent: "center" }
const $frame: ViewStyle = { ...StyleSheet.absoluteFill, borderWidth: 2, zIndex: 2 }
