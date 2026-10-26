import { type Ref, useEffect, useRef, useState } from "react"
import { AccessibilityInfo, Pressable, StyleSheet, View, type ViewStyle } from "react-native"
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  FadeOut,
  IOSReferenceFrame,
  runOnJS,
  SensorType,
  type SharedValue,
  useAnimatedSensor,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import Svg, { Path, Text as SvgText, TextPath } from "react-native-svg"

import { getPlayerGridCellRects, getPlayerGridLayout } from "@/components/playerGridGeometry"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { tableTurnLanding } from "./tableTurn"

// why: the default frame lets the magnetometer correct heading, and near a magnet it jumps tens of degrees mid-turn; gyro-only drift stays under a degree over a turn.
const SENSOR_CONFIG = {
  interval: 10,
  adjustToInterfaceOrientation: false,
  iosReferenceFrame: IOSReferenceFrame.XArbitraryZVertical,
}
const LEAD_MS = 35
const FOLLOW = 0.6
const SETTLE_DEG = 80
const SETTLE_MS = 250
const DONE_DEG = 88
const STILL_DEG_PER_MS = 0.02
const HINT_FROM_DEG = 15
const HINT_AFTER_MS = 700
const DECLINE_BELOW_DEG = 5
const FALLBACK_TURN_MS = 1800

const RING = 300
const RING_RADIUS = 112
const RING_FONT = 16
const MINI = { width: 58, height: 84 }

export function TableTurnOffer({
  angle,
  unfolded,
  holderAngle,
  tableSlotColors,
  onLand,
  onKeep,
}: {
  angle: SharedValue<number>
  unfolded: SharedValue<number>
  holderAngle: number
  tableSlotColors?: readonly string[]
  onLand: (landing: "upright" | "reversed") => void
  onKeep: () => void
}) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const ring = useRef<View>(null)
  // why: the offer blocks the board, so VoiceOver moves to its choice instead of staying on a life control beneath it.
  useEffect(() => {
    if (ring.current) AccessibilityInfo.sendAccessibilityEvent(ring.current, "focus")
  }, [])
  const rotation = useAnimatedSensor(SensorType.ROTATION, SENSOR_CONFIG)
  const following = useSharedValue(true)
  const startHeading = useSharedValue<number | null>(null)
  const reading = useSharedValue({ angle: 0, speed: 0 })
  const stillSince = useSharedValue(0)
  const hint = useSharedValue(0)
  const hinting = useSharedValue(false)
  const uprightWay = -Math.sign(holderAngle)
  const direction = useSharedValue(uprightWay)
  const chosenWay = useSharedValue(0)

  const land = (shown: number) => {
    "worklet"
    following.set(false)
    angle.set(
      withTiming(Math.sign(shown) * 90, { duration: 220 }, (finished) => {
        if (finished) runOnJS(onLand)(tableTurnLanding(shown, holderAngle))
      }),
    )
  }

  // why: the gyroscope is read once per frame and its speed measured over whole frames; reacting to each sample measured speed across the uneven gaps between samples, which overshot and stepped back every third frame.
  useFrameCallback(({ timeSincePreviousFrame }) => {
    if (!following.value) return
    // why: opening the hinge tilts the sensors, so the turn is measured only from a flat device.
    if (unfolded.value < 1) {
      startHeading.set(null)
      return
    }
    const { qx, qy, qz, qw } = rotation.sensor.value
    // why: heading from the quaternion is the turn about gravity even with the device tilted, where Euler yaw mixes in pitch and roll. It grows as the device turns counterclockwise, which the board answers by turning clockwise.
    const facing =
      (Math.atan2(2 * (qx * qy + qw * qz), 1 - 2 * (qy * qy + qz * qz)) * 180) / Math.PI
    if (startHeading.value === null) {
      startHeading.set(facing)
      reading.set({ angle: 0, speed: 0 })
      return
    }
    const previous = reading.value
    const step = ((((facing - startHeading.value - previous.angle) % 360) + 540) % 360) - 180
    const turned = previous.angle + step
    const speed = previous.speed * 0.7 + (step / Math.max(timeSincePreviousFrame ?? 16.7, 1)) * 0.3
    reading.set({ angle: turned, speed })
    // why: the display shows a frame or two after the reading, so the board aims ahead by the measured speed and eases toward that aim to hide sensor jitter.
    const shown = angle.value + (turned + speed * LEAD_MS - angle.value) * FOLLOW
    // why: past a quarter turn the board stops, so turning further never carries it beyond the Table layout.
    angle.set(Math.max(-90, Math.min(90, shown)))

    const way = shown > 5 ? 1 : shown < -5 ? -1 : 0
    if (way !== 0 && way !== chosenWay.value) {
      chosenWay.set(way)
      direction.set(withTiming(way, { duration: 400 }))
    }
    const now = performance.now()
    const still = Math.abs(speed) <= STILL_DEG_PER_MS
    if (!still) {
      stillSince.set(0)
      if (hinting.value) {
        hinting.set(false)
        hint.set(withTiming(0, { duration: 200 }))
      }
    } else if (stillSince.value === 0) stillSince.set(now)
    const resting = still ? now - stillSince.value : 0
    // why: a turn left partway reads as finished, so the ring comes back to ask for the rest of it.
    if (!hinting.value && Math.abs(turned) >= HINT_FROM_DEG && resting >= HINT_AFTER_MS) {
      hinting.set(true)
      hint.set(withTiming(1, { duration: 900 }))
    }
    if (Math.abs(shown) >= DONE_DEG || (Math.abs(turned) >= SETTLE_DEG && resting >= SETTLE_MS))
      land(shown)
  })

  const [tapTurning, setTapTurning] = useState(false)
  const tapTurn = (duration: number) =>
    angle.set(
      withTiming(
        uprightWay * 90,
        { duration, easing: Easing.inOut(Easing.cubic), reduceMotion: ReduceMotion.Never },
        (finished) => {
          if (finished) runOnJS(onLand)("upright")
        },
      ),
    )
  const turnByTap = () => {
    following.set(false)
    setTapTurning(true)
    tapTurn(motionDuration(reducedMotion, FALLBACK_TURN_MS))
  }
  // why: turning Reduce Motion on mid-turn finishes the board at once instead of letting the timed turn play out.
  useEffect(() => {
    if (tapTurning && reducedMotion !== false) tapTurn(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapTurning, reducedMotion])

  const keep = () => {
    if (Math.abs(angle.value) >= DECLINE_BELOW_DEG || unfolded.value < 1) return
    following.set(false)
    onKeep()
  }

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: openedFully(unfolded.value) * (1 - Math.min(Math.abs(angle.value) / HINT_FROM_DEG, 1)),
  }))
  const ringStyle = useAnimatedStyle(() => ({
    opacity:
      openedFully(unfolded.value) *
      Math.max(1 - Math.min(Math.abs(angle.value) / HINT_FROM_DEG, 1), hint.value),
  }))

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      exiting={FadeOut.duration(250)}
      pointerEvents="box-none"
      accessibilityViewIsModal
      style={StyleSheet.absoluteFill}
    >
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
        <Pressable
          testID="table-turn-keep"
          accessibilityRole="button"
          accessibilityLabel={translate("board:tableTurn.keep")}
          onPress={keep}
          style={[StyleSheet.absoluteFill, themed($scrim)]}
        />
      </Animated.View>
      <Animated.View pointerEvents="box-none" style={[$center, ringStyle]}>
        <TurnRing
          angle={angle}
          holderAngle={holderAngle}
          direction={direction}
          tableSlotColors={tableSlotColors}
          ringRef={ring}
          onPress={turnByTap}
        />
      </Animated.View>
    </Animated.View>
  )
}

function openedFully(unfolded: number) {
  "worklet"
  return Math.max((unfolded - 0.9) / 0.1, 0)
}

function arcPoint(degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180
  return [RING / 2 + radius * Math.cos(radians), RING / 2 + radius * Math.sin(radians)] as const
}

function arrowPath(center: number, toward: 1 | -1) {
  const radius = RING_RADIUS + RING_FONT * 0.36
  const [x0, y0] = arcPoint(center - 6 * toward, radius)
  const [x1, y1] = arcPoint(center + 9 * toward, radius)
  const [tipX, tipY] = arcPoint(center - 13 * toward, radius)
  const [outerX, outerY] = arcPoint(center - 6 * toward, radius + 6)
  const [innerX, innerY] = arcPoint(center - 6 * toward, radius - 6)
  const sweep = toward === 1 ? 0 : 1
  return `M ${x1} ${y1} A ${radius} ${radius} 0 0 ${sweep} ${x0} ${y0} M ${outerX} ${outerY} L ${tipX} ${tipY} L ${innerX} ${innerY}`
}

function RingArrows({ toward, color }: { toward: 1 | -1; color: string }) {
  return (
    <Svg width={RING} height={RING}>
      {[-90, 30, 150].map((gap) => (
        <Path
          key={gap}
          d={arrowPath(gap, toward)}
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  )
}

/** why: the cue circles and spins the way the device turns, so every side of a six-player table reads it in turn. */
function TurnRing({
  angle,
  holderAngle,
  direction,
  tableSlotColors,
  ringRef,
  onPress,
}: {
  angle: SharedValue<number>
  holderAngle: number
  direction: SharedValue<number>
  tableSlotColors?: readonly string[]
  ringRef: Ref<View>
  onPress: () => void
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const spin = useSharedValue(0)
  useFrameCallback(({ timeSincePreviousFrame }) => {
    if (reducedMotion !== false) return
    spin.set(spin.value - (direction.value * (timeSincePreviousFrame ?? 0) * 360) / 18000)
  })
  useEffect(() => {
    if (reducedMotion !== false) spin.set(0)
  }, [reducedMotion, spin])
  const spinning = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }))
  // why: the ring holds still on the table with the board, so its small Table picture always matches what the players will get.
  const heldStill = useAnimatedStyle(() => ({
    transform: [{ rotate: `${holderAngle + angle.value}deg` }],
  }))
  const counterclockwise = useAnimatedStyle(() => ({ opacity: (1 + direction.value) / 2 }))
  const clockwise = useAnimatedStyle(() => ({ opacity: (1 - direction.value) / 2 }))
  const middle = RING / 2
  const circle = `M ${middle} ${middle - RING_RADIUS} A ${RING_RADIUS} ${RING_RADIUS} 0 1 1 ${middle} ${middle + RING_RADIUS} A ${RING_RADIUS} ${RING_RADIUS} 0 1 1 ${middle} ${middle - RING_RADIUS}`
  const circumference = 2 * Math.PI * RING_RADIUS
  const cue = translate("board:tableTurn.cue").toLocaleUpperCase()
  const mini = [
    ...getPlayerGridCellRects({
      playerCount: 6,
      layout: getPlayerGridLayout({ playerCount: 6, ...MINI, layoutVariant: "tabletop" }),
      board: MINI,
      gap: 2,
    }),
  ]

  return (
    <Pressable
      ref={ringRef}
      testID="table-turn-ring"
      accessibilityRole="button"
      accessibilityLabel={translate("board:tableTurn.turn")}
      onPress={onPress}
      style={$ring}
    >
      <View style={themed($disc)} />
      <Animated.View style={[StyleSheet.absoluteFill, heldStill]}>
        <Animated.View style={[StyleSheet.absoluteFill, spinning]}>
          <Svg width={RING} height={RING}>
            <Path id="table-turn-circle" d={circle} fill="none" />
            {[1, 3, 5].map((sixth) => (
              <SvgText
                key={sixth}
                fill={colors.board.text}
                fontSize={RING_FONT}
                fontWeight="700"
                letterSpacing={1.5}
                textAnchor="middle"
              >
                <TextPath href="#table-turn-circle" startOffset={(circumference * sixth) / 6}>
                  {cue}
                </TextPath>
              </SvgText>
            ))}
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, counterclockwise]}>
            <RingArrows toward={1} color={colors.board.cue} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, clockwise]}>
            <RingArrows toward={-1} color={colors.board.cue} />
          </Animated.View>
        </Animated.View>
        <View style={$mini}>
          {mini.map(([slot, rect]) => (
            <View
              key={slot}
              style={[
                $miniSeat,
                {
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  backgroundColor: tableSlotColors?.[slot] ?? colors.board.border,
                },
              ]}
            />
          ))}
        </View>
      </Animated.View>
    </Pressable>
  )
}

const $scrim: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.gameMenu.backdrop,
})

const $center: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  alignItems: "center",
  justifyContent: "center",
}

const $ring: ViewStyle = { width: RING, height: RING }

// why: over gathered seats the picture's colors match the cards behind it and vanish, so the ring sits on its own dark glass.
const $disc: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  left: 4,
  top: 4,
  width: RING - 8,
  height: RING - 8,
  borderRadius: RING,
  backgroundColor: colors.board.background,
  opacity: 0.82,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: colors.board.border,
})

const $mini: ViewStyle = {
  position: "absolute",
  left: (RING - MINI.width) / 2,
  top: (RING - MINI.height) / 2,
  ...MINI,
}

const $miniSeat: ViewStyle = { position: "absolute", borderRadius: 3 }
