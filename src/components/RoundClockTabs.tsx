import { memo } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import Animated from "react-native-reanimated"
import Svg, { Circle, Path } from "react-native-svg"

import type { PlaySystemId } from "@/features/game/playSystems"
import { formatRemaining, roundClockText, type RoundClock } from "@/features/game/roundClock"
import { useRoundClockView } from "@/features/game/useRoundClockView"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { EDGE_SLIDES, edgeStyle, FIRST_PLAYER_TAB, type FirstPlayerTab } from "./FirstPlayerTabs"
import { Text } from "./Text"

const BORDER = 4
const WARN_MS = 5 * 60_000

/**
 * why: the round clock lives in the edge tabs where the first-player tab was, at the menu's seam,
 * each copy turned toward the players nearest it. Every copy opens the same controls, so screen
 * readers and keyboards get only the first.
 */
export const RoundClockTabs = memo(function RoundClockTabs({
  tabs,
  clock,
  system,
  onPress,
}: {
  tabs: readonly FirstPlayerTab[]
  clock: RoundClock
  system?: PlaySystemId
  onPress: () => void
}) {
  const {
    theme: { colors },
  } = useAppTheme()
  const animateFully = useReducedMotion() === false
  const view = useRoundClockView(clock, system)
  if (!view) return null
  const ink = colors.gameMenu.anchorGlyph
  const paused = clock.pausedAt !== undefined
  const called = view.kind === "time"
  const text = called
    ? view.turns > 0
      ? `${Math.min(view.turn, view.turns)}/${view.turns}`
      : translate("board:clock.time")
    : view.kind === "remaining"
      ? formatRemaining(view.ms)
      : roundClockText(view)
  const urgent = called || (view.kind === "remaining" && view.ms <= WARN_MS)
  const label = called
    ? roundClockText(view) || translate("board:clock.time")
    : translate(
        view.kind === "remaining"
          ? paused
            ? "board:clock.leftPaused"
            : "board:clock.left"
          : paused
            ? "board:clock.elapsedPaused"
            : "board:clock.elapsed",
        { time: text },
      )

  return (
    <>
      {tabs.map((tab, index) => {
        const primary = index === 0
        const alongSide = tab.edge === "left" || tab.edge === "right"
        const press = alongSide
          ? { width: FIRST_PLAYER_TAB.depth - BORDER, height: FIRST_PLAYER_TAB.length - 2 * BORDER }
          : { width: FIRST_PLAYER_TAB.length - 2 * BORDER, height: FIRST_PLAYER_TAB.depth - BORDER }
        const face = tab.facing % 180 === 0 ? press : { width: press.height, height: press.width }
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
              edgeStyle(tab, FIRST_PLAYER_TAB),
              {
                backgroundColor: colors.gameMenu.anchor,
                borderColor: colors.gameMenu.anchorBorder,
              },
            ]}
          >
            <BoardPressable
              testID={primary ? "round-clock-tab" : "round-clock-tab-mirror"}
              tabIndex={primary ? undefined : -1}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint={translate("board:clock.opensRoundClock")}
              onPress={onPress}
              style={({ pressed }) => [$press, pressed && { backgroundColor: `${ink}2E` }]}
            >
              <View
                style={[
                  $face,
                  face,
                  {
                    left: (press.width - face.width) / 2,
                    top: (press.height - face.height) / 2,
                    transform: [{ rotate: `${tab.facing}deg` }],
                  },
                ]}
              >
                {paused ? <PauseGlyph color={ink} /> : <ClockGlyph color={ink} />}
                <Text
                  size="xxs"
                  weight={urgent ? "bold" : "semiBold"}
                  style={[$digits, { color: ink }]}
                  text={text}
                />
              </View>
            </BoardPressable>
          </Animated.View>
        )
      })}
    </>
  )
})

function ClockGlyph({ color }: { color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9.5} stroke={color} strokeWidth={3} fill="none" />
      <Path d="M12 7v5l3 2" stroke={color} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Svg>
  )
}

function PauseGlyph({ color }: { color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24">
      <Path d="M8 5v14M16 5v14" stroke={color} strokeWidth={4} strokeLinecap="round" />
    </Svg>
  )
}

const $tab: ViewStyle = { position: "absolute", borderWidth: BORDER, overflow: "hidden" }
const $press: ViewStyle = { flex: 1 }
const $face: ViewStyle = {
  position: "absolute",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
}
const $digits: TextStyle = { fontVariant: ["tabular-nums"], lineHeight: 14 }
