import { createContext, memo } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, { Easing, Keyframe, ReduceMotion } from "react-native-reanimated"

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

const TAB_LENGTH = 52
const TAB_DEPTH = 40
export const TURN_TAB_FACE = { width: 44, height: 74 } as const
export const TURN_TAB_BORDER = 4
/**
 * why: the first-player tab becomes the turn tab in the same place, so seats clear the turn tab
 * from the start and their chrome never shifts between the two. Beside seats at the sides the turn
 * tab's face runs into the board, so along the edge it is as short as the first-player tab and the
 * names beside it keep their room; it reaches deeper instead.
 */
export const FIRST_PLAYER_TAB = {
  length: Math.max(TAB_LENGTH, TURN_TAB_FACE.width + 2 * TURN_TAB_BORDER),
  depth: Math.max(TAB_DEPTH, TURN_TAB_FACE.height + TURN_TAB_BORDER),
} as const
const FIRST_TAB_SIZE = { length: TAB_LENGTH, depth: TAB_DEPTH } as const
/** why: seats beside a tab step their corner chrome past it only while the tabs show, then slide back. */
export const FirstPlayerTabsShownContext = createContext(false)
const TAB_BORDER = 4
const GLYPH_SIZE = 22
const TAB_ENTER_DELAY_MS = 260
const TAB_SLIDE_MS = 200

/** why: a tab slides out of its edge when it appears and back into it when it goes, while the marks beside it slide into the room it leaves. Reanimated reads the system setting only at startup, so the live preference gates these instead. */
function edgeSlides(edge: BoardEdge) {
  const tuckedBy = (share: number) => ({
    transform: [
      { translateX: (edge === "left" ? -TAB_DEPTH : edge === "right" ? TAB_DEPTH : 0) * share },
      { translateY: (edge === "top" ? -TAB_DEPTH : edge === "bottom" ? TAB_DEPTH : 0) * share },
    ],
  })
  return {
    // why: web keyframes only take named ease-in curves, so the ease-out is drawn as a midpoint: an ease-out quad has three quarters of the way behind it halfway through.
    entering: new Keyframe({ 0: tuckedBy(1), 50: tuckedBy(0.25), 100: tuckedBy(0) })
      .delay(TAB_ENTER_DELAY_MS)
      .duration(TAB_SLIDE_MS)
      .reduceMotion(ReduceMotion.Never),
    exiting: new Keyframe({ 0: tuckedBy(0), 100: { ...tuckedBy(1), easing: Easing.quad } })
      .duration(TAB_SLIDE_MS)
      .reduceMotion(ReduceMotion.Never),
  }
}

export const EDGE_SLIDES = {
  left: edgeSlides("left"),
  right: edgeSlides("right"),
  top: edgeSlides("top"),
  bottom: edgeSlides("bottom"),
} satisfies Record<BoardEdge, ReturnType<typeof edgeSlides>>

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
            entering={animateFully ? EDGE_SLIDES[tab.edge].entering : undefined}
            exiting={animateFully ? EDGE_SLIDES[tab.edge].exiting : undefined}
            aria-hidden={!primary}
            accessibilityElementsHidden={!primary}
            importantForAccessibility={primary ? "auto" : "no-hide-descendants"}
            style={[
              $tab,
              edgeStyle(tab, FIRST_TAB_SIZE),
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

export function edgeStyle(
  { edge, at }: FirstPlayerTab,
  { length: TAB_LENGTH, depth: TAB_DEPTH }: { length: number; depth: number },
): ViewStyle {
  const RADIUS = TAB_DEPTH / 2
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
