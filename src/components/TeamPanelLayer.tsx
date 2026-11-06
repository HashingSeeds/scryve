import { useState } from "react"
import type { ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Svg, { Path } from "react-native-svg"

import type { TurnChipState } from "@/features/game/dice"
import { useAppTheme } from "@/theme/context"

import type {
  LifeCardContentInsets,
  LifeCardContentRotation,
  LifeCardMenuCorner,
  LifeCardMenuEdge,
} from "./playerCardTypes"
import { TurnChipLayer } from "./TurnChip"

/** why: two treatments are on trial for showing that two touching cards are one team. `link` joins the totals with a rivet on the seam; `frame` outlines the pair as one card. */
export type TeamBinding = "link" | "frame"

/** why: a Two-Headed Giant team's two cards share one turn chip and the mark that binds them, so both draw above the pair. */
export function TeamPanelLayer({
  binding,
  foreground,
  rotation,
  compact,
  seatNumber,
  turnChip,
  contentInsets,
  menuCorner,
  menuEdgeCenter,
}: {
  binding: TeamBinding
  foreground: string
  rotation: LifeCardContentRotation
  compact?: boolean
  seatNumber: number
  turnChip?: TurnChipState
  contentInsets?: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
}) {
  const {
    theme: { colors, radius },
  } = useAppTheme()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const rivet = compact ? 26 : 32
  return (
    <View
      pointerEvents="box-none"
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
          pointerEvents="none"
          style={[
            $frame,
            {
              borderColor: colors.palette.neutral600,
              borderRadius: compact ? radius.xxl : radius.xxxl,
            },
          ]}
        />
      ) : (
        <View pointerEvents="none" style={$center}>
          <View
            testID={`team-link-${seatNumber}`}
            style={[
              $rivet,
              {
                width: rivet,
                height: rivet,
                borderRadius: rivet / 2,
                backgroundColor: colors.background,
                transform: [{ rotate: `${rotation}deg` }],
              },
            ]}
          >
            <LinkGlyph size={rivet * 0.6} color={colors.textDim} />
          </View>
        </View>
      )}
      {turnChip ? (
        <TurnChipLayer
          state={turnChip}
          seatNumber={seatNumber}
          foreground={foreground}
          compact={compact}
          rotation={rotation}
          cardSize={size}
          contentInsets={contentInsets}
          menuCorner={menuCorner}
          menuEdgeCenter={menuEdgeCenter}
        />
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
