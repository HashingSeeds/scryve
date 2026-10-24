import { memo } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated"

import type { DiceTool } from "@/features/game/dice"
import { useAppTheme } from "@/theme/context"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { DieFace } from "./DiceGlyph"
import { PlayerMark } from "./PlayerMark"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

export interface FirstPlayerOffer {
  glyph: { tool: DiceTool } | { seatNumber: number; shape?: PlayerMarkShape; color: string }
  accessibilityLabel: string
  onPress: () => void
}

export type BoardEdge = "left" | "right" | "top" | "bottom"

export interface FirstPlayerTab {
  edge: BoardEdge
  at: number
  facing: number
}

const TAB_LENGTH = 56
const TAB_DEPTH = 40
const TAB_BORDER = 2
const GLYPH_SIZE = 22
// why: Reanimated reads the system setting only at startup, so the live preference gates this instead.
const TAB_ENTERING = FadeIn.delay(260).duration(180).reduceMotion(ReduceMotion.Never)

/** why: the tool needs no words, so each copy can sit at an edge and turn toward whoever is nearest. Every copy runs the same action, so screen readers and keyboards get only the first. */
export const FirstPlayerTabs = memo(function FirstPlayerTabs({
  offer,
  tabs,
}: {
  offer: FirstPlayerOffer
  tabs: readonly FirstPlayerTab[]
}) {
  const {
    theme: { colors },
  } = useAppTheme()
  const animateFully = useReducedMotion() === false
  const { glyph } = offer

  return (
    <>
      {tabs.map((tab, index) => {
        const primary = index === 0
        return (
          <Animated.View
            key={`${tab.edge}:${tab.at}`}
            entering={animateFully ? TAB_ENTERING : undefined}
            aria-hidden={!primary}
            accessibilityElementsHidden={!primary}
            importantForAccessibility={primary ? "auto" : "no-hide-descendants"}
            style={[
              $tab,
              edgeStyle(tab),
              {
                backgroundColor: colors.gameMenu.anchor,
                borderColor: "color" in glyph ? glyph.color : colors.gameMenu.anchorBorder,
              },
            ]}
          >
            <BoardPressable
              testID={primary ? "first-player-tab" : "first-player-tab-mirror"}
              tabIndex={primary ? undefined : -1}
              accessibilityRole="button"
              accessibilityLabel={offer.accessibilityLabel}
              onPress={offer.onPress}
              style={({ pressed }) => [$press, pressed && $pressed]}
            >
              <View style={{ transform: [{ rotate: `${tab.facing}deg` }] }}>
                {"tool" in glyph ? (
                  <DieFace
                    tool={glyph.tool}
                    size={GLYPH_SIZE}
                    color={colors.gameMenu.anchorGlyph}
                  />
                ) : (
                  <PlayerMark
                    seatNumber={glyph.seatNumber}
                    shape={glyph.shape}
                    color={glyph.color}
                    size={GLYPH_SIZE}
                  />
                )}
              </View>
            </BoardPressable>
          </Animated.View>
        )
      })}
    </>
  )
})

const RADIUS = TAB_DEPTH / 2

function edgeStyle({ edge, at }: FirstPlayerTab): ViewStyle {
  const along = `${at * 100}%` as const
  switch (edge) {
    case "left":
      return {
        left: 0,
        top: along,
        marginTop: -TAB_LENGTH / 2,
        width: TAB_DEPTH,
        height: TAB_LENGTH,
        borderLeftWidth: 0,
        borderTopRightRadius: RADIUS,
        borderBottomRightRadius: RADIUS,
      }
    case "right":
      return {
        right: 0,
        top: along,
        marginTop: -TAB_LENGTH / 2,
        width: TAB_DEPTH,
        height: TAB_LENGTH,
        borderRightWidth: 0,
        borderTopLeftRadius: RADIUS,
        borderBottomLeftRadius: RADIUS,
      }
    case "top":
      return {
        top: 0,
        left: along,
        marginLeft: -TAB_LENGTH / 2,
        width: TAB_LENGTH,
        height: TAB_DEPTH,
        borderTopWidth: 0,
        borderBottomLeftRadius: RADIUS,
        borderBottomRightRadius: RADIUS,
      }
    case "bottom":
      return {
        bottom: 0,
        left: along,
        marginLeft: -TAB_LENGTH / 2,
        width: TAB_LENGTH,
        height: TAB_DEPTH,
        borderBottomWidth: 0,
        borderTopLeftRadius: RADIUS,
        borderTopRightRadius: RADIUS,
      }
  }
}

const $tab: ViewStyle = { position: "absolute", borderWidth: TAB_BORDER, overflow: "hidden" }
const $press: ViewStyle = { flex: 1, alignItems: "center", justifyContent: "center" }
const $pressed: ViewStyle = { opacity: 0.72 }
