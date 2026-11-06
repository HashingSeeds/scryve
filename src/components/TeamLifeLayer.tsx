import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { StyleSheet, useWindowDimensions, View } from "react-native"

import type { TurnChipState } from "@/features/game/dice"
import { counterValueLabel, type PlaySystemId } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"

import {
  getLifeFontSizeThatFits,
  getLifeLineHeight,
  LIFE_MAX_FONT_SCALE,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "./playerCardTypes"
import { Text } from "./Text"
import { TurnChipLayer } from "./TurnChip"

/**
 * why: a Two-Headed Giant team has one life total, so the panel draws it once across both heads.
 * Taps still land on the heads' own halves underneath, which keeps who changed it.
 */
export function TeamLifeLayer({
  teamLabel,
  life,
  out,
  shown,
  foreground,
  rotation,
  compact,
  system,
  seatNumber,
  turnChip,
  contentInsets,
  menuCorner,
  menuEdgeCenter,
}: {
  teamLabel: string
  life: number
  out: boolean
  shown: boolean
  foreground: string
  rotation: LifeCardContentRotation
  compact?: boolean
  system?: PlaySystemId
  seatNumber: number
  turnChip?: TurnChipState
  contentInsets?: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
}) {
  const { fontScale } = useWindowDimensions()
  const [size, setSize] = useState({ width: 0, height: 0 })
  const sideways = Math.abs(rotation) === 90
  const run = sideways ? size.height : size.width
  const depth = sideways ? size.width : size.height
  const digits = String(life).length
  const fontSize = getLifeFontSizeThatFits({
    availableWidth: Math.max(run * 0.42, 1),
    availableHeight: Math.max(depth * 0.66, 1),
    digits,
    fontScale,
  })
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
      {shown && size.width > 0 ? (
        <View pointerEvents="none" style={$center}>
          <View style={[$readout, { transform: [{ rotate: `${rotation}deg` }] }]}>
            <Text
              testID={`team-life-${seatNumber}`}
              text={String(life)}
              weight="bold"
              accessibilityLabel={translate("board:counters.seatItem", {
                identity: teamLabel,
                label: counterValueLabel(system, life),
              })}
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={LIFE_MAX_FONT_SCALE}
              numberOfLines={1}
              style={[
                $life,
                { fontSize, lineHeight: getLifeLineHeight(fontSize), color: foreground },
                out && $out,
              ]}
            />
          </View>
        </View>
      ) : null}
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

const $center: ViewStyle = {
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2,
}
const $readout: ViewStyle = { alignItems: "center", justifyContent: "center" }
const $life: TextStyle = { textAlign: "center", fontVariant: ["tabular-nums"] }
const $out: TextStyle = { opacity: 0.55 }
