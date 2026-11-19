import type { ViewStyle } from "react-native"
import Animated, { FadeIn, FadeOut, useAnimatedStyle, withTiming } from "react-native-reanimated"

import { translate } from "@/i18n/translate"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { useCommanderFlights } from "./CommanderFlights"
import { Check, Sword } from "./Sword"

/** why: the sword after a seat's name starts its commander attack; while the attack is open the same spot holds the check that ends it, so the attacker's thumb finds Done where it started. */
export function SeatSword({
  seatNumber,
  identity,
  color,
  size,
  finish,
  disabled,
  onPress,
}: {
  seatNumber: number
  identity: string
  color: string
  size: number
  finish?: { submit: "done" | "send"; onPress: () => void }
  disabled: boolean
  onPress?: () => void
}) {
  const reducedMotion = useReducedMotion()
  const swap = motionDuration(reducedMotion, SWAP_MS)
  const { anchor, homeBound } = useCommanderFlights()
  // why: after Done the sword shows again only as its blades meet back here.
  const away = !finish && homeBound === seatNumber
  const awayStyle = useAnimatedStyle(() => ({
    opacity: withTiming(away ? 0 : 1, { duration: away ? 0 : 120 }),
  }))
  return (
    <BoardPressable
      testID={finish ? `commander-finish-seat-${seatNumber}` : `commander-sword-seat-${seatNumber}`}
      accessibilityRole="button"
      accessibilityLabel={
        finish
          ? translate(`board:commander.submitAssigningFromSeat.${finish.submit}`, {
              seat: seatNumber,
            })
          : translate("board:commander.assignFrom", { identity })
      }
      accessibilityState={{ disabled: !finish && disabled }}
      disabled={!finish && disabled}
      hitSlop={(TARGET - size) / 2}
      onPress={finish?.onPress ?? onPress}
      style={({ pressed }) => [{ width: size, height: size }, $center, pressed && $pressed]}
    >
      <Animated.View ref={anchor("home", seatNumber)} collapsable={false} style={awayStyle}>
        <Animated.View
          key={finish ? "check" : "sword"}
          entering={swap ? FadeIn.duration(swap).delay(swap / 2) : undefined}
          exiting={swap ? FadeOut.duration(swap / 2) : undefined}
          style={$center}
        >
          {finish ? (
            <Check size={Math.round(size * CHECK_SHARE)} color={color} />
          ) : (
            <Sword size={size} color={color} />
          )}
        </Animated.View>
      </Animated.View>
    </BoardPressable>
  )
}

const SWAP_MS = 240
// why: 44pt is the smallest comfortable touch target.
const TARGET = 44
// why: the check's ink runs wider than the sword's, so it sits a little smaller to match.
const CHECK_SHARE = 0.94
const $center: ViewStyle = { alignItems: "center", justifyContent: "center" }
const $pressed: ViewStyle = { opacity: 0.72 }
