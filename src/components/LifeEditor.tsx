import { memo, useEffect, useRef, useState } from "react"
import type { GestureResponderEvent, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import * as Haptics from "expo-haptics"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated"

import { MAX_LIFE_DELTA } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"
import { accessibleForeground } from "@/utils/colorContrast"
import { useCloseOnBack } from "@/utils/useCloseOnBack"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import {
  getLifeLineHeight,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
  type LifeCardMenuCorner,
  type LifeCardMenuEdge,
} from "./playerCardTypes"
import { mirroredSteps, StepChips, stepChipsHeight } from "./StepChips"
import { Text } from "./Text"

// why: a step narrower than this is hard to land on with a finger, so a short track shows fewer steps and the held end carries on past them.
const MIN_STEP_PX = 8
const MAJOR_TICK_EVERY = 5
// why: Rubik Bold digits ink about 0.72em tall and 0.64em wide; the total keeps a little air around its ink instead of its whole line box, so it can stay near board size.
const VALUE_BOX = 0.84
const DIGIT_WIDTH = 0.64
const CLOSE_SIZE = 32
const MIN_TITLE_WIDTH = 40
const HEADER_GAP = 8
const METRICS = {
  regular: { padding: 12, gap: 8, track: 68, thumb: 36, minValue: 48 },
  compact: { padding: 6, gap: 4, track: 52, thumb: 30, minValue: 36 },
} as const
const EDGE_DELAY_MS = 350
const EDGE_REPEAT_MS = 110
const BALLOON_SPRING = { damping: 30, stiffness: 340, mass: 0.7 }
const HEADER_EDGES = {
  0: { top: "top", left: "left", right: "right", start: "topLeft", end: "topRight" },
  90: { top: "right", left: "top", right: "bottom", start: "topRight", end: "bottomRight" },
  [-90]: { top: "left", left: "bottom", right: "top", start: "bottomLeft", end: "topLeft" },
  180: { top: "bottom", left: "right", right: "left", start: "bottomRight", end: "bottomLeft" },
} as const

function deltaLabel(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta}`
}

function lifeEditorHeaderPosition(
  rotation: LifeCardContentRotation,
  insets: LifeCardContentInsets | undefined,
  menuCorner: LifeCardMenuCorner | undefined,
  compact: boolean,
) {
  const safe = insets ?? { top: 0, bottom: 0, left: 0, right: 0 }
  const edges = HEADER_EDGES[rotation]
  const edgeInset = compact ? 12 : 20
  const menuInset = compact ? 36 : 44
  return {
    top: (compact ? 12 : 16) + safe[edges.top],
    left: Math.max(edgeInset + safe[edges.left], menuCorner === edges.start ? menuInset : 0),
    right: Math.max(edgeInset + safe[edges.right], menuCorner === edges.end ? menuInset : 0),
  }
}

export function lifeEditorValueLayout(input: {
  width: number
  height: number
  compact: boolean
  sourceFontSize: number
  digits: number
  header: { top: number; left: number; right: number }
}) {
  const { width, height, compact, sourceFontSize, header } = input
  const metrics = METRICS[compact ? "compact" : "regular"]
  const controls =
    metrics.gap * 2 + stepChipsHeight(compact ? "compact" : "regular") + metrics.track
  const digitWidth = Math.max(input.digits, 2) * DIGIT_WIDTH
  const closeClearance = header.right + CLOSE_SIZE + HEADER_GAP
  const byHeight = (height - metrics.padding * 2 - controls) / VALUE_BOX
  const byWidth = (width - 2 * closeClearance) / digitWidth
  const fontSize = Math.max(
    Math.min(sourceFontSize, metrics.minValue),
    Math.floor(Math.min(sourceFontSize, byHeight, byWidth)),
  )
  const column = controls + fontSize * VALUE_BOX
  const valueTop = metrics.padding + Math.max(0, (height - metrics.padding * 2 - column) / 2)
  const titleRoom =
    width > 0 && valueTop < header.top + CLOSE_SIZE
      ? Math.max(0, (width - fontSize * digitWidth) / 2 - header.left - HEADER_GAP)
      : undefined
  return { fontSize, titleRoom }
}

type Props = {
  seatNumber: number
  playerName: string
  life: number
  sourceFontSize: number
  system?: PlaySystemId
  color: string
  rotation: LifeCardContentRotation
  boardRotation?: number
  cardWidth: number
  cardHeight: number
  contentInsets?: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  onChange: (delta: number) => void
  onClose: () => void
}

export function LifeEditor({
  seatNumber,
  playerName,
  life,
  sourceFontSize,
  system,
  color,
  rotation,
  boardRotation = 0,
  cardWidth,
  cardHeight,
  contentInsets,
  menuCorner,
  menuEdgeCenter,
  onChange,
  onClose,
}: Props) {
  const { theme } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const editorColor = mixColorsInLinearLight(color, "#000000", 0.82)
  const ink = accessibleForeground(editorColor)
  const rules = playSystemRules(system)
  const { quickAdjustments, tapStep, scrubStep, scrubSteps } = rules.counter
  const [preview, setPreview] = useState(life)
  const [dragging, setDragging] = useState(false)
  const [closing, setClosing] = useState(false)
  const start = useRef({ x: 0, y: 0, life })
  const draft = useRef(life)
  const [trackWidth, setTrackWidth] = useState(1)
  const [balloonWidth, setBalloonWidth] = useState(56)
  const edgeDirection = useRef(0)
  const edgeExtra = useRef(0)
  const edgeDelay = useRef<ReturnType<typeof setTimeout> | null>(null)
  const edgeRepeat = useRef<ReturnType<typeof setInterval> | null>(null)
  const balloonX = useSharedValue(0)
  const thumbX = useSharedValue(0)
  const valueProgress = useSharedValue(reducedMotion === false ? 0 : 1)
  const overlayOpacity = useSharedValue(reducedMotion === false ? 0 : 1)
  const [valueCenter, setValueCenter] = useState<number | null>(null)
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }))
  const balloonStyle = useAnimatedStyle(() => ({
    left: balloonX.value,
    transform: [
      { translateX: -balloonWidth / 2 },
      {
        rotate: `${Math.max(-0.12, Math.min(0.12, Math.atan2(balloonX.value - thumbX.value, 100)))}rad`,
      },
    ],
  }))
  const trackSteps = Math.max(1, Math.min(scrubSteps, Math.floor(trackWidth / 2 / MIN_STEP_PX)))
  const scrubbed = Math.max(
    -trackSteps,
    Math.min(trackSteps, Math.round((preview - start.current.life) / scrubStep)),
  )
  const compact = Math.min(cardWidth, cardHeight) > 0 && Math.min(cardWidth, cardHeight) < 220
  const metrics = METRICS[compact ? "compact" : "regular"]
  const thumbLeft = `${50 + (scrubbed / trackSteps) * 50}%` as const
  const trackInset = compact ? 10 : 18
  const balloonTarget =
    trackInset +
    Math.max(
      balloonWidth / 2,
      Math.min(trackWidth - balloonWidth / 2, trackWidth * (0.5 + scrubbed / (2 * trackSteps))),
    )
  const thumbTarget = trackInset + trackWidth * (0.5 + scrubbed / (2 * trackSteps))
  const chipSteps = mirroredSteps([...quickAdjustments, tapStep])
  const sideways = Math.abs(rotation) === 90 && cardWidth > 0 && cardHeight > 0
  const editorWidth = sideways ? cardHeight : cardWidth
  const editorHeight = sideways ? cardWidth : cardHeight
  const headerPosition = lifeEditorHeaderPosition(rotation, contentInsets, menuCorner, compact)
  const { fontSize: valueFontSize, titleRoom } = lifeEditorValueLayout({
    width: editorWidth,
    height: editorHeight,
    compact,
    sourceFontSize,
    digits: String(life).length,
    header: headerPosition,
  })
  const valueLineHeight = getLifeLineHeight(valueFontSize)
  const safe = contentInsets ?? { top: 0, bottom: 0, left: 0, right: 0 }
  const valueStyle = useAnimatedStyle(() => ({
    opacity: valueCenter === null ? 0 : 1,
    transform: [
      { translateY: (editorHeight / 2 - (valueCenter ?? 0)) * (1 - valueProgress.value) },
      { scale: 1 + (sourceFontSize / valueFontSize - 1) * (1 - valueProgress.value) },
    ],
  }))
  const rotatedBounds: ViewStyle | undefined = sideways
    ? {
        width: cardHeight,
        height: cardWidth,
        left: (cardWidth - cardHeight) / 2,
        top: (cardHeight - cardWidth) / 2,
        right: undefined,
        bottom: undefined,
      }
    : undefined
  const menuTitleWidth =
    menuEdgeCenter === HEADER_EDGES[rotation].top && editorWidth > 0
      ? Math.max(
          0,
          editorWidth / 2 -
            (compact ? 35 : 40) -
            (compact ? 12 : 20) -
            safe[HEADER_EDGES[rotation].left],
        )
      : undefined
  const titleWidth =
    menuTitleWidth === undefined || titleRoom === undefined
      ? (menuTitleWidth ?? titleRoom)
      : Math.min(menuTitleWidth, titleRoom)

  useEffect(() => {
    const dragDelta = dragging ? draft.current - start.current.life : 0
    draft.current = life
    start.current.life = life
    if (dragging) draft.current += dragDelta
    setPreview(draft.current)
  }, [dragging, life])

  useEffect(() => {
    thumbX.value = thumbTarget
    balloonX.value = dragging ? withSpring(balloonTarget, BALLOON_SPRING) : balloonTarget
  }, [balloonTarget, balloonX, dragging, thumbTarget, thumbX])

  useEffect(() => {
    if (valueCenter === null || closing) return
    valueProgress.value = withTiming(1, { duration: reducedMotion === false ? 220 : 0 })
  }, [closing, reducedMotion, valueCenter, valueProgress])

  useEffect(() => {
    if (closing) return
    overlayOpacity.value = withTiming(1, { duration: reducedMotion === false ? 180 : 0 })
  }, [closing, overlayOpacity, reducedMotion])

  useEffect(() => () => stopEdge(), [])

  function stopEdge() {
    if (edgeDelay.current) clearTimeout(edgeDelay.current)
    if (edgeRepeat.current) clearInterval(edgeRepeat.current)
    edgeDelay.current = null
    edgeRepeat.current = null
    edgeDirection.current = 0
  }

  function holdEdge(direction: number) {
    if (direction === edgeDirection.current) return
    stopEdge()
    if (!direction) return
    edgeDirection.current = direction
    edgeDelay.current = setTimeout(() => {
      edgeRepeat.current = setInterval(() => {
        const nextDelta = draft.current - start.current.life + direction * scrubStep
        if (Math.abs(nextDelta) > MAX_LIFE_DELTA) return stopEdge()
        edgeExtra.current += direction * scrubStep
        moveDraft(draft.current + direction * scrubStep)
      }, EDGE_REPEAT_MS)
    }, EDGE_DELAY_MS)
  }

  // why: each whole step the drag crosses ticks, so the slider feels its steps as well as showing them.
  function moveDraft(next: number) {
    if (next === draft.current) return
    draft.current = next
    setPreview(next)
    if (reducedMotion === false && localGameRepository.hapticsEnabled()) {
      void Haptics.selectionAsync().catch(() => undefined)
    }
  }

  function apply(delta: number) {
    if (!delta || Math.abs(delta) > MAX_LIFE_DELTA) return
    onChange(delta)
  }

  function drag(event: GestureResponderEvent) {
    const dx = event.nativeEvent.pageX - start.current.x
    const dy = event.nativeEvent.pageY - start.current.y
    const screenAngle = ((rotation + boardRotation) * Math.PI) / 180
    const distance = dx * Math.cos(screenAngle) + dy * Math.sin(screenAngle)
    const rawSteps = Math.round((distance / Math.max(trackWidth / 2, 1)) * trackSteps)
    const clampedSteps = Math.max(-trackSteps, Math.min(trackSteps, rawSteps))
    holdEdge(rawSteps >= trackSteps ? 1 : rawSteps <= -trackSteps ? -1 : 0)
    moveDraft(start.current.life + clampedSteps * scrubStep + edgeExtra.current)
  }

  useCloseOnBack(true, closeEditor)

  function closeEditor() {
    if (closing) return
    setClosing(true)
    stopEdge()
    if (reducedMotion !== false || valueCenter === null) return onClose()
    overlayOpacity.value = withDelay(150, withTiming(0, { duration: 70 }))
    valueProgress.value = withTiming(0, { duration: 220 }, (finished) => {
      if (finished) runOnJS(onClose)()
    })
  }

  return (
    <Animated.View
      testID={`life-editor-seat-${seatNumber}`}
      accessibilityViewIsModal
      pointerEvents={closing ? "box-only" : "auto"}
      // why: controls claim their own touches first, so only a tap on the backdrop reaches here.
      onStartShouldSetResponder={() => true}
      onResponderRelease={closeEditor}
      style={[
        styles.overlay,
        compact && styles.compactOverlay,
        rotatedBounds,
        {
          backgroundColor: editorColor,
          paddingLeft: (compact ? 6 : 12) + safe[HEADER_EDGES[rotation].left],
          paddingRight: (compact ? 6 : 12) + safe[HEADER_EDGES[rotation].right],
          transform: [{ rotate: `${rotation}deg` }],
        },
        overlayStyle,
      ]}
    >
      <View
        testID={`life-editor-header-seat-${seatNumber}`}
        style={[styles.header, headerPosition]}
      >
        <Text
          testID={`life-editor-title-seat-${seatNumber}`}
          // why: a name with no room beside the total would clip to a letter, so it steps aside; the seat's color still says whose editor this is.
          text={titleWidth !== undefined && titleWidth < MIN_TITLE_WIDTH ? "" : playerName}
          accessibilityLabel={playerName}
          weight="bold"
          numberOfLines={1}
          style={[styles.title, { color: ink, maxWidth: titleWidth }]}
        />
        <BoardPressable
          testID={`life-editor-close-seat-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel={translate("board:lifeEditor.close")}
          onPress={closeEditor}
          hitSlop={12}
          style={styles.closeButton}
        >
          <View
            style={[styles.closeStroke, { backgroundColor: ink, transform: [{ rotate: "45deg" }] }]}
          />
          <View
            style={[
              styles.closeStroke,
              { backgroundColor: ink, transform: [{ rotate: "-45deg" }] },
            ]}
          />
        </BoardPressable>
      </View>
      <Animated.View
        testID={`life-editor-value-seat-${seatNumber}`}
        onLayout={(event) =>
          setValueCenter(
            (current) =>
              current ?? event.nativeEvent.layout.y + event.nativeEvent.layout.height / 2,
          )
        }
        style={valueStyle}
      >
        <Text
          text={String(preview)}
          weight="bold"
          accessibilityLiveRegion="polite"
          maxFontSizeMultiplier={1}
          numberOfLines={1}
          style={[
            styles.value,
            {
              color: ink,
              fontSize: valueFontSize,
              lineHeight: valueLineHeight,
              marginVertical: (valueFontSize * VALUE_BOX - valueLineHeight) / 2,
            },
          ]}
        />
      </Animated.View>
      <View
        testID={`life-editor-actions-seat-${seatNumber}`}
        style={[styles.actions, compact && styles.compactActions]}
      >
        <StepChips
          steps={chipSteps}
          onStep={apply}
          ink={ink}
          size={compact ? "compact" : "regular"}
          testID={`life-editor-step-${seatNumber}`}
          accessibilityLabel={(step) =>
            translate(
              step > 0
                ? `board:lifeEditor.add.${rules.id}`
                : `board:lifeEditor.subtract.${rules.id}`,
              { amount: Math.abs(step) },
            )
          }
        />
      </View>
      {/* why: the slider sits last, nearest the player, so its balloon floats over the chips, which a drag has no use for, and never over the total. */}
      <View style={[styles.scrubArea, { paddingHorizontal: trackInset }]}>
        {dragging ? (
          <Animated.View
            style={[
              styles.balloon,
              { bottom: metrics.track / 2 + metrics.thumb / 2 },
              balloonStyle,
            ]}
            pointerEvents="none"
            onLayout={(event) => setBalloonWidth(event.nativeEvent.layout.width)}
          >
            <View
              style={[
                styles.balloonBody,
                compact && styles.compactBalloonBody,
                { backgroundColor: theme.colors.tint },
              ]}
            >
              <Text
                testID={`life-editor-balloon-seat-${seatNumber}`}
                text={deltaLabel(preview - start.current.life)}
                weight="bold"
                size={compact ? "xl" : "xxl"}
                maxFontSizeMultiplier={1}
                style={[styles.balloonText, { color: editorColor }]}
              />
            </View>
            <View
              testID={`life-editor-balloon-pointer-seat-${seatNumber}`}
              style={[
                styles.balloonPointer,
                {
                  borderLeftColor: theme.colors.transparent,
                  borderRightColor: theme.colors.transparent,
                  borderTopColor: theme.colors.tint,
                },
              ]}
            />
          </Animated.View>
        ) : null}
        <View
          testID={`life-editor-slider-seat-${seatNumber}`}
          accessibilityRole="adjustable"
          accessibilityLabel={translate(`board:lifeEditor.slider.${rules.id}`, {
            name: playerName,
          })}
          accessibilityValue={{ text: deltaLabel(preview - start.current.life) }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={({ nativeEvent }) =>
            apply(nativeEvent.actionName === "increment" ? scrubStep : -scrubStep)
          }
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(event) => {
            start.current = {
              x: event.nativeEvent.pageX,
              y: event.nativeEvent.pageY,
              life: draft.current,
            }
            edgeExtra.current = 0
            setDragging(true)
          }}
          onResponderMove={drag}
          onResponderRelease={() => {
            stopEdge()
            setDragging(false)
            const delta = draft.current - start.current.life
            draft.current = life
            setPreview(life)
            if (delta && Math.abs(delta) <= MAX_LIFE_DELTA) {
              onChange(delta)
            }
          }}
          onResponderTerminate={() => {
            stopEdge()
            setDragging(false)
            draft.current = start.current.life
            setPreview(draft.current)
          }}
          style={[styles.trackTouch, { height: metrics.track }]}
        >
          <View
            style={[styles.track, { backgroundColor: theme.colors.board.border }]}
            pointerEvents="none"
          />
          <TrackTicks seatNumber={seatNumber} steps={trackSteps} color={theme.colors.board.text} />
          <View
            style={[
              styles.thumb,
              {
                left: thumbLeft,
                width: metrics.thumb,
                height: metrics.thumb,
                transform: [{ translateX: -metrics.thumb / 2 }],
                backgroundColor: theme.colors.tint,
              },
            ]}
            pointerEvents="none"
          />
        </View>
      </View>
    </Animated.View>
  )
}

const TrackTicks = memo(function TrackTicks({
  seatNumber,
  steps,
  color,
}: {
  seatNumber: number
  steps: number
  color: string
}) {
  return (
    <View
      testID={`life-editor-ticks-seat-${seatNumber}`}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {Array.from({ length: steps * 2 + 1 }, (_, index) => {
        const step = index - steps
        return (
          <View
            key={step}
            style={[
              styles.tick,
              step === 0
                ? styles.zeroTick
                : step % MAJOR_TICK_EVERY === 0
                  ? styles.majorTick
                  : styles.minorTick,
              { left: `${50 + (step / steps) * 50}%`, backgroundColor: color },
            ]}
          />
        )
      })}
    </View>
  )
})

const styles = StyleSheet.create({
  actions: { alignSelf: "stretch", marginHorizontal: 8 },
  balloon: {
    alignItems: "center",
    minWidth: 56,
    position: "absolute",
  },
  balloonBody: {
    alignItems: "center",
    borderRadius: radius.xxl,
    minWidth: 56,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  balloonPointer: {
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    height: 0,
    width: 0,
  },
  balloonText: { fontVariant: ["tabular-nums"] },
  closeButton: {
    alignItems: "center",
    height: CLOSE_SIZE,
    justifyContent: "center",
    width: CLOSE_SIZE,
  },
  closeStroke: { borderRadius: radius.full, height: 2, position: "absolute", width: 20 },
  compactActions: { marginHorizontal: 6 },
  compactBalloonBody: { paddingVertical: 2 },
  compactOverlay: { gap: METRICS.compact.gap, padding: METRICS.compact.padding },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    position: "absolute",
  },
  majorTick: { height: 12, marginTop: -6, opacity: 0.6, width: 2 },
  minorTick: { height: 6, marginTop: -3, opacity: 0.3, width: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    gap: METRICS.regular.gap,
    justifyContent: "center",
    padding: METRICS.regular.padding,
    zIndex: 20,
  },
  scrubArea: { width: "90%" },
  thumb: { borderRadius: radius.full, position: "absolute" },
  tick: {
    borderRadius: radius.full,
    position: "absolute",
    top: "50%",
    transform: [{ translateX: -1 }],
  },
  title: { flex: 1 },
  track: { borderRadius: radius.full, height: 6 },
  trackTouch: { justifyContent: "center", width: "100%" },
  value: { fontVariant: ["tabular-nums"] },
  zeroTick: { height: 16, marginTop: -8, opacity: 0.9, width: 2 },
})
