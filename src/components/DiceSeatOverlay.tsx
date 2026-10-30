import { useEffect, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Platform, StyleSheet, View } from "react-native"
import Animated, {
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  FadeOut,
} from "react-native-reanimated"

import {
  DIE_SIDES,
  PROMPT_FADE_MS,
  rollLabel,
  rollValueLabel,
  toolLabel,
  type BagDie,
  type DiceSeatChip,
  type DiceSeatView,
  type DiceTool,
} from "@/features/game/dice"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { DieFace } from "./DiceGlyph"
import type { LifeCardContentRotation } from "./playerCardTypes"
import { Text } from "./Text"

export interface LifeCardDice {
  view?: DiceSeatView
  armed?: DiceTool
  leaving?: boolean
  chips?: readonly DiceSeatChip[]
  onPress: () => void
  onChoose?: (order: "first" | "second") => void
  onPressChip?: (chip: DiceSeatChip) => void
}

export function diceCoversSeat(dice: LifeCardDice | undefined): boolean {
  return !!dice && (dice.view !== undefined || dice.armed !== undefined)
}

export interface DiceSeatOverlayProps {
  seatNumber: number
  playerName: string
  color: string
  foreground: string
  contentRotation: LifeCardContentRotation
  compact?: boolean
  dice: LifeCardDice
}

const TURN_ORDERS = ["first", "second"] as const

const BLOOM_SPRING = { damping: 14, stiffness: 180, mass: 0.8 } as const
const BLOOM_START_SCALE = 0.4
const BLOOM_START_TURN_DEG = -40
const BLOOM_EXIT_MS = 160
// why: Reanimated reads the system setting only at startup, so animations we already gate on the live preference must not consult it again.
const GATED_MOTION = ReduceMotion.Never
// why: the result itself flies into its chip, so the card behind it only fades. On web the exit copy lands at the wrong place and size on a turned seat, so web skips it and lets the chip carry the handoff.
const BLOOM_EXITING =
  Platform.OS === "web" ? undefined : FadeOut.duration(BLOOM_EXIT_MS).reduceMotion(GATED_MOTION)
const PROMPT_FADE_IN_MS = 200
const ARMED_PULSE_SCALE = 1.08
const ARMED_PULSE_MS = 650
// why: the seat's life stays faintly visible behind the prompt, so players still know whose seat it is.
const ARMED_TINT_OPACITY = 0.88
const TUMBLE_TICKS = 9
const tumbleStepMs = (step: number) => 30 + step * step * 1.2
const COIN_FLIP_MS = 640
const COIN_HALF_TURNS = 6

export function DiceSeatOverlay(props: DiceSeatOverlayProps) {
  return <Bloom key={viewKey(props.dice.view)} {...props} />
}

function Bloom({
  seatNumber,
  playerName,
  color,
  foreground,
  contentRotation,
  compact,
  dice,
}: DiceSeatOverlayProps) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const { view, armed } = dice
  const covers = !!view && view.kind !== "waiting"
  const scrim = view?.kind === "waiting" || (view?.kind === "first" && view.status === "lost")
  const dim = view?.kind === "rolloff" && (view.status === "lost" || view.status === "out")
  const rotationStyle: ViewStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const animate = reducedMotion === false && !!view && !scrim
  const interactive = view?.kind !== "waiting" && view?.kind !== "choice"
  const tumble = useTumble(animate ? view : undefined)

  const arrive = useSharedValue(animate ? 0 : 1)
  useEffect(() => {
    arrive.value = animate ? withSpring(1, BLOOM_SPRING) : 1
  }, [animate, arrive])
  const arriveStyle = useAnimatedStyle(() => ({
    opacity: arrive.value,
    transform: [
      { scale: BLOOM_START_SCALE + (1 - BLOOM_START_SCALE) * arrive.value },
      { rotate: `${BLOOM_START_TURN_DEG * (1 - arrive.value)}deg` },
    ],
  }))

  const prompting = !!armed && !view
  const leaving = prompting && !!dice.leaving
  // why: dice mode tints every seat at once, so the prompt fades in and out rather than cutting.
  const promptOpacity = useSharedValue(prompting && reducedMotion === false ? 0 : 1)
  useEffect(() => {
    if (!prompting) return
    const target = leaving ? 0 : 1
    promptOpacity.value =
      reducedMotion === false
        ? withTiming(target, { duration: leaving ? PROMPT_FADE_MS : PROMPT_FADE_IN_MS })
        : target
  }, [leaving, prompting, promptOpacity, reducedMotion])
  const promptStyle = useAnimatedStyle(() => ({ opacity: promptOpacity.value }))
  const overlayStyle = [
    themed($overlay),
    compact && themed($compactOverlay),
    covers && !scrim && { backgroundColor: color },
    scrim && themed($scrim),
    prompting && [themed($ring), { borderColor: foreground }],
  ]
  const content = prompting ? (
    <>
      <View style={[$fill, { backgroundColor: color, opacity: ARMED_TINT_OPACITY }]} />
      <View style={[themed($content), rotationStyle]}>
        <ArmedPrompt tool={armed} foreground={foreground} compact={compact} />
      </View>
    </>
  ) : view && covers && !scrim ? (
    <View style={[themed($content), rotationStyle, dim && $dim]}>
      <Result
        view={view}
        playerName={playerName}
        foreground={foreground}
        compact={compact}
        tumble={tumble}
        onChoose={dice.onChoose}
      />
    </View>
  ) : null

  return (
    <Animated.View
      exiting={animate ? BLOOM_EXITING : undefined}
      pointerEvents={leaving ? "none" : "box-none"}
      style={[$layer, animate && arriveStyle, prompting && promptStyle]}
    >
      {view?.kind === "choice" ? (
        <View testID={`dice-seat-${seatNumber}`} accessible={false} style={overlayStyle}>
          {content}
        </View>
      ) : (
        <BoardPressable
          testID={`dice-seat-${seatNumber}`}
          accessibilityRole={interactive ? "button" : undefined}
          accessibilityLabel={accessibilityLabel(playerName, view, armed)}
          accessibilityHint={
            interactive && view ? translate("board:dice.settlesResult") : undefined
          }
          disabled={!interactive || leaving}
          onPress={dice.onPress}
          style={overlayStyle}
        >
          {content}
        </BoardPressable>
      )}
    </Animated.View>
  )
}

function ArmedPrompt({
  tool,
  foreground,
  compact,
}: {
  tool: DiceTool
  foreground: string
  compact?: boolean
}) {
  const reducedMotion = useReducedMotion()
  const pulse = useSharedValue(1)
  useEffect(() => {
    if (reducedMotion !== false) {
      pulse.value = 1
      return
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(ARMED_PULSE_SCALE, { duration: ARMED_PULSE_MS, reduceMotion: GATED_MOTION }),
        withTiming(1, { duration: ARMED_PULSE_MS, reduceMotion: GATED_MOTION }),
      ),
      -1,
      false,
      undefined,
      GATED_MOTION,
    )
  }, [pulse, reducedMotion])
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))
  return (
    <>
      <Animated.View testID="dice-armed-prompt" style={pulseStyle}>
        <DieFace tool={tool} size={compact ? 48 : 72} color={foreground} />
      </Animated.View>
      <Text
        tx={tool === "coin" ? "board:dice.tapToFlip" : "board:dice.tapToRoll"}
        weight="bold"
        size={compact ? "xs" : "sm"}
        maxFontSizeMultiplier={1.2}
        style={{ color: foreground }}
      />
    </>
  )
}

type Tumble = { face?: number; flipping: boolean; flip: SharedValue<number> }

function useTumble(view: DiceSeatView | undefined): Tumble {
  const rolling = view ? rollingTool(view) : undefined
  const [state, setState] = useState<{ face?: number; flipping: boolean }>(() =>
    rolling && rolling !== "coin"
      ? { face: passingFace(0, rolling), flipping: false }
      : { flipping: rolling === "coin" },
  )
  const flip = useSharedValue(0)
  useEffect(() => {
    if (!rolling) {
      flip.value = 1
      setState((current) =>
        current.face === undefined && !current.flipping ? current : { flipping: false },
      )
      return
    }
    if (rolling === "coin") {
      flip.value = withTiming(1, { duration: COIN_FLIP_MS })
      const landing = setTimeout(() => setState({ flipping: false }), COIN_FLIP_MS)
      return () => clearTimeout(landing)
    }
    const timers: ReturnType<typeof setTimeout>[] = []
    let delay = 0
    for (let step = 1; step < TUMBLE_TICKS; step += 1) {
      delay += tumbleStepMs(step)
      timers.push(
        setTimeout(() => setState({ face: passingFace(step, rolling), flipping: false }), delay),
      )
    }
    timers.push(setTimeout(() => setState({ flipping: false }), delay + tumbleStepMs(TUMBLE_TICKS)))
    return () => timers.forEach(clearTimeout)
  }, [flip, rolling])
  return { ...state, flip }
}

function passingFace(step: number, die: BagDie) {
  let seed = 7
  for (let i = 0; i <= step; i += 1) seed = (seed * 1103515245 + 12345) % 2147483648
  return (seed % DIE_SIDES[die]) + 1
}

function rollingTool(view: DiceSeatView): DiceTool | undefined {
  if (view.kind === "roll") return view.roll.tool
  if (view.kind === "rolloff") return view.die
  if (view.kind === "flip") return "coin"
  return undefined
}

function viewKey(view: DiceSeatView | undefined) {
  if (!view) return "armed"
  if (view.kind === "roll") return `roll:${view.roll.tool}:${view.attempt}`
  if (view.kind === "rolloff") return `rolloff:${view.attempt}`
  return view.kind
}

function Result({
  view,
  playerName,
  foreground,
  compact,
  tumble,
  onChoose,
}: {
  view: DiceSeatView
  playerName: string
  foreground: string
  compact?: boolean
  tumble: Tumble
  onChoose?: (order: "first" | "second") => void
}) {
  const { themed } = useAppTheme()
  const text = { color: foreground }
  const tumbling = tumble.face !== undefined
  const label = (value: string) => (
    <Text text={value} weight="bold" size="xs" maxFontSizeMultiplier={1.2} style={text} />
  )
  const headline = (value: string) => (
    <Text
      text={value}
      weight="bold"
      maxFontSizeMultiplier={1.2}
      style={[themed(compact ? $compactHeadline : $headline), text]}
    />
  )
  if (view.kind === "choice")
    return (
      <>
        {label(translate(`board:dice.choiceReason.${view.reason}`))}
        {headline(translate("board:dice.goesFirstQuestion"))}
        <View style={themed($options)}>
          {TURN_ORDERS.map((order) => (
            <BoardPressable
              key={order}
              testID={`dice-go-${order}`}
              accessibilityRole="button"
              accessibilityLabel={translate(`board:dice.goesOrder.${order}`, { name: playerName })}
              onPress={() => onChoose?.(order)}
              style={({ pressed }) => [
                themed(compact ? $compactOption : $option),
                { borderColor: foreground },
                pressed && $pressed,
              ]}
            >
              <Text
                tx={`board:dice.goOrder.${order}`}
                weight="bold"
                size={compact ? "xxs" : "xs"}
                maxFontSizeMultiplier={1.2}
                style={text}
              />
            </BoardPressable>
          ))}
        </View>
      </>
    )
  if (view.kind === "first")
    return (
      <>
        {view.note ? label(view.note) : null}
        {headline(translate("board:dice.goesFirstHeadline"))}
      </>
    )
  if (view.kind === "rolloff")
    return (
      <>
        {label(toolLabel(view.die))}
        <Text
          text={String(tumble.face ?? view.value)}
          weight="medium"
          maxFontSizeMultiplier={1.2}
          style={[themed(compact ? $compactValue : $value), text]}
        />
        {tumbling
          ? null
          : view.status === "won"
            ? label(translate("board:dice.goesFirstHeadline"))
            : view.status === "chooses"
              ? label(translate("board:dice.choiceReason.roll"))
              : view.status === "tied"
                ? label(translate("board:dice.tie"))
                : view.status === "out"
                  ? label(translate("board:dice.out"))
                  : null}
      </>
    )
  if (view.kind === "waiting") return null
  if (view.kind === "flip")
    return (
      <>
        {label(translate("board:dice.tool.coin"))}
        <FlippingCoin flip={tumble.flip} foreground={foreground} compact={compact} />
      </>
    )
  return (
    <>
      {label(toolLabel(view.roll.tool))}
      {tumble.flipping ? (
        <FlippingCoin flip={tumble.flip} foreground={foreground} compact={compact} />
      ) : (
        <Text
          text={tumble.face === undefined ? rollValueLabel(view.roll) : String(tumble.face)}
          weight="medium"
          maxFontSizeMultiplier={1.2}
          style={[themed(compact ? $compactValue : $value), text]}
        />
      )}
    </>
  )
}

function FlippingCoin({
  flip,
  foreground,
  compact,
}: {
  flip: SharedValue<number>
  foreground: string
  compact?: boolean
}) {
  const size = compact ? 46 : 64
  const spin = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.abs(Math.cos(flip.value * Math.PI * COIN_HALF_TURNS)) }],
  }))
  return (
    <Animated.View
      testID="dice-coin-flipping"
      style={[
        $coin,
        { width: size, height: size, borderRadius: size / 2, borderColor: foreground },
        spin,
      ]}
    />
  )
}

function accessibilityLabel(playerName: string, view?: DiceSeatView, armed?: DiceTool) {
  if (view?.kind === "roll") return rollLabel(playerName, view.roll)
  if (view?.kind === "rolloff")
    return translate(`board:dice.rolloffLabel.${view.status}`, {
      name: playerName,
      value: view.value,
    })
  if (view?.kind === "choice")
    return translate(`board:dice.choiceLabel.${view.reason}`, { name: playerName })
  if (view?.kind === "waiting") return translate("board:dice.waitingForChoice")
  if (view?.kind === "flip") return translate("board:dice.flippingForFirst")
  if (view?.kind === "first")
    return translate(`board:dice.firstLabel.${view.status}`, { name: playerName })
  return armed === "coin"
    ? translate("board:dice.flipCoinFor", { name: playerName })
    : translate("board:dice.rollDieFor", { name: playerName, die: armed && toolLabel(armed) })
}

// why: a seat with dice on it is the dice's; the layer sits above counter chips (10) and the Pokémon bar (15) so no control underneath takes the tap. The z-index lives on the animated wrapper because its entering transform opens a stacking context of its own.
const $layer: ViewStyle = { ...StyleSheet.absoluteFill, zIndex: 16 }
const $fill: ViewStyle = StyleSheet.absoluteFill
const $overlay: ThemedStyle<ViewStyle> = ({ radius }) => ({
  ...StyleSheet.absoluteFill,
  overflow: "hidden",
  borderRadius: radius.xxxl,
  alignItems: "center",
  justifyContent: "center",
})
const $compactOverlay: ThemedStyle<ViewStyle> = ({ radius }) => ({
  borderRadius: radius.xxl,
})
const $ring: ThemedStyle<ViewStyle> = () => ({ borderWidth: 3 })
const $scrim: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.board.background,
  opacity: 0.6,
})
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.xxxs,
})
const $dim: ViewStyle = { opacity: 0.45 }
const $value: ThemedStyle<TextStyle> = () => ({ fontSize: 64, lineHeight: 70 })
const $compactValue: ThemedStyle<TextStyle> = () => ({ fontSize: 40, lineHeight: 46 })
const $headline: ThemedStyle<TextStyle> = () => ({ fontSize: 40, lineHeight: 46 })
const $compactHeadline: ThemedStyle<TextStyle> = () => ({ fontSize: 26, lineHeight: 32 })
const $options: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
  marginTop: spacing.xs,
})
const $option: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  minHeight: 44,
  paddingHorizontal: spacing.md,
  borderRadius: radius.md,
  borderWidth: 1.5,
  justifyContent: "center",
})
const $compactOption: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  minHeight: 38,
  paddingHorizontal: spacing.sm,
  borderRadius: radius.md,
  borderWidth: 1.5,
  justifyContent: "center",
})
const $pressed: ViewStyle = { opacity: 0.72 }
const $coin: ViewStyle = { borderWidth: 3 }
