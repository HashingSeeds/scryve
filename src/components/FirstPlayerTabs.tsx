import { createContext, memo } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, {
  Easing,
  type EntryExitAnimationFunction,
  withDelay,
  withTiming,
} from "react-native-reanimated"

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
export const FIRST_PLAYER_TAB = { length: TAB_LENGTH, depth: TAB_DEPTH } as const
/** why: seats beside a tab step their corner chrome past it only while the tabs show, then slide back. */
export const FirstPlayerTabsShownContext = createContext(false)
const TAB_BORDER = 4
const GLYPH_SIZE = 22
const TAB_ENTER_DELAY_MS = 260
const TAB_SLIDE_MS = 200

function outward(edge: BoardEdge) {
  return {
    x: edge === "left" ? -TAB_DEPTH : edge === "right" ? TAB_DEPTH : 0,
    y: edge === "top" ? -TAB_DEPTH : edge === "bottom" ? TAB_DEPTH : 0,
  }
}

/** why: a tab slides out of its edge when it appears and back into it when it goes, while the marks beside it slide into the room it leaves. */
function slideFromEdge(edge: BoardEdge): EntryExitAnimationFunction {
  const { x, y } = outward(edge)
  return () => {
    "worklet"
    const timing = { duration: TAB_SLIDE_MS, easing: Easing.out(Easing.quad) }
    return {
      initialValues: { transform: [{ translateX: x }, { translateY: y }] },
      animations: {
        transform: [
          { translateX: withDelay(TAB_ENTER_DELAY_MS, withTiming(0, timing)) },
          { translateY: withDelay(TAB_ENTER_DELAY_MS, withTiming(0, timing)) },
        ],
      },
    }
  }
}

function tuckIntoEdge(edge: BoardEdge): EntryExitAnimationFunction {
  const { x, y } = outward(edge)
  return () => {
    "worklet"
    const timing = { duration: TAB_SLIDE_MS, easing: Easing.in(Easing.quad) }
    return {
      initialValues: { transform: [{ translateX: 0 }, { translateY: 0 }] },
      animations: {
        transform: [{ translateX: withTiming(x, timing) }, { translateY: withTiming(y, timing) }],
      },
    }
  }
}

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
            entering={animateFully ? slideFromEdge(tab.edge) : undefined}
            exiting={animateFully ? tuckIntoEdge(tab.edge) : undefined}
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
