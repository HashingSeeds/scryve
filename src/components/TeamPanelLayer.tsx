import { useState } from "react"
import type { ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Svg, { Path } from "react-native-svg"

import { useAppTheme } from "@/theme/context"

import type { LifeCardContentRotation } from "./playerCardTypes"
import { teamRivet } from "./teamGridGeometry"

/** why: two treatments are on trial for showing that two touching cards are one team. `link` joins the totals with a rivet on the seam; `frame` outlines the pair as one card. */
export type TeamBinding = "link" | "frame"

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
  const rivet = teamRivet(size, rotation, compact, menuAtSeam)
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
                width: rivet.size,
                height: rivet.size,
                borderRadius: rivet.size / 2,
                backgroundColor: colors.background,
                transform: [
                  { translateX: rivet.x },
                  { translateY: rivet.y },
                  { rotate: `${rotation}deg` },
                ],
              },
            ]}
          >
            <LinkGlyph size={rivet.size * 0.6} color={colors.textDim} />
          </View>
        </View>
      ) : null}
    </View>
  )
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
