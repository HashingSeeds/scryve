import { memo } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, { ReduceMotion, ZoomIn } from "react-native-reanimated"

import type { DiceTool } from "@/features/game/dice"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { DiceGlyph } from "./DiceGlyph"
import { COMPACT_MENU_BUTTON_SIZE, MENU_BUTTON_SIZE } from "./GameRadialMenu"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

export interface FirstPlayerOffer {
  color: string
  glyph: { tool: DiceTool } | { seatNumber: number; shape?: PlayerMarkShape }
  label: string
  accessibilityLabel: string
  onPress: () => void
}

const CHIP_HEIGHT = 44
const CHIP_MAX_WIDTH = 220
const CHIP_GAP = 8
const CHOOSER_RING_WIDTH = 3
const GLYPH_SIZE = 20
// why: Reanimated reads the system setting only at startup, so the live preference gates this instead.
const CHIP_ENTERING = ZoomIn.delay(260).duration(180).reduceMotion(ReduceMotion.Never)

/** why: players read the board from every side, so the offer is repeated once per direction the seats face (`facings`, clockwise degrees in this view's frame), each copy turned toward its players. When seats face both across and along the board, the copies pinwheel around the menu button so neighbors never overlap. Each copy sits in a square around the anchor because Android drops touches outside a parent's bounds. */
export const FirstPlayerChips = memo(function FirstPlayerChips({
  offer,
  anchor,
  facings,
  compact,
}: {
  offer: FirstPlayerOffer
  anchor: { x: number; y: number }
  facings: readonly number[]
  compact?: boolean
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const animateFully = useReducedMotion() === false
  const reach = (compact ? COMPACT_MENU_BUTTON_SIZE : MENU_BUTTON_SIZE) / 2 + CHIP_GAP
  const box = 2 * (reach + CHIP_MAX_WIDTH)
  const pinwheel = facings.some((f) => f % 180 === 0) && facings.some((f) => f % 180 !== 0)
  const chooser = "seatNumber" in offer.glyph
  // why: a loser's own color would vanish on their own card, so their chip is dark with a ring in their color.
  const fill = chooser ? colors.gameMenu.anchor : offer.color
  const foreground = accessibleForeground(fill)

  return (
    <>
      {facings.map((facing, index) => {
        const primary = index === 0
        return (
          <View
            key={facing}
            pointerEvents="box-none"
            // why: every copy runs the same action, so screen readers and keyboards get only the first.
            aria-hidden={!primary}
            accessibilityElementsHidden={!primary}
            importantForAccessibility={primary ? "auto" : "no-hide-descendants"}
            style={[
              $box,
              {
                left: `${anchor.x * 100}%`,
                top: `${anchor.y * 100}%`,
                width: box,
                height: box,
                marginLeft: -box / 2,
                marginTop: -box / 2,
                transform: [{ rotate: `${facing}deg` }],
              },
            ]}
          >
            <View
              pointerEvents="box-none"
              style={[
                $row,
                { top: box / 2 + reach },
                pinwheel ? [$pinwheelRow, { paddingLeft: box / 2 - reach }] : null,
              ]}
            >
              <Animated.View entering={animateFully ? CHIP_ENTERING : undefined}>
                <BoardPressable
                  testID={primary ? "first-player-badge" : "first-player-badge-mirror"}
                  tabIndex={primary ? undefined : -1}
                  accessibilityRole="button"
                  accessibilityLabel={offer.accessibilityLabel}
                  onPress={offer.onPress}
                  style={({ pressed }) => [
                    themed($chip),
                    { backgroundColor: fill },
                    chooser && { borderWidth: CHOOSER_RING_WIDTH, borderColor: offer.color },
                    pressed && $pressed,
                  ]}
                >
                  {"tool" in offer.glyph ? (
                    <DiceGlyph tool={offer.glyph.tool} size={GLYPH_SIZE} color={foreground} />
                  ) : (
                    <PlayerMark
                      seatNumber={offer.glyph.seatNumber}
                      shape={offer.glyph.shape}
                      color={foreground}
                      size={GLYPH_SIZE}
                    />
                  )}
                  <Text
                    text={offer.label}
                    weight="bold"
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    style={[$label, { color: foreground }]}
                  />
                </BoardPressable>
              </Animated.View>
            </View>
          </View>
        )
      })}
    </>
  )
})

const $box: ViewStyle = { position: "absolute" }
const $row: ViewStyle = { position: "absolute", left: 0, right: 0, alignItems: "center" }
const $pinwheelRow: ViewStyle = { alignItems: "flex-start" }
const $chip: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  height: CHIP_HEIGHT,
  maxWidth: CHIP_MAX_WIDTH,
  paddingLeft: 12,
  paddingRight: 16,
  borderRadius: CHIP_HEIGHT / 2,
  shadowColor: colors.gameMenu.shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 7,
  elevation: 12,
})
const $label: TextStyle = { flexShrink: 1, fontSize: 15, lineHeight: 20, letterSpacing: 0.3 }
const $pressed: ViewStyle = { opacity: 0.72 }
