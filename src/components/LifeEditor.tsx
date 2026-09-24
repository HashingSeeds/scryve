import { useEffect, useRef, useState } from "react"
import type { GestureResponderEvent, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated"

import { MAX_LIFE_DELTA } from "@/features/game/domain"
import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import { useAppTheme } from "@/theme/context"
import { accessibleForeground } from "@/utils/colorContrast"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import type {
  LifeCardContentInsets,
  LifeCardContentRotation,
  LifeCardMenuCorner,
} from "./playerCardTypes"
import { Text } from "./Text"

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
): ViewStyle {
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

type Props = {
  seatNumber: number
  playerName: string
  life: number
  sourceFontSize: number
  system?: PlaySystemId
  color: string
  rotation: LifeCardContentRotation
  cardWidth: number
  cardHeight: number
  contentInsets?: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
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
  cardWidth,
  cardHeight,
  contentInsets,
  menuCorner,
  onChange,
  onClose,
}: Props) {
  const { theme } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const editorColor = mixColorsInLinearLight(color, "#000000", 0.82)
  const ink = accessibleForeground(editorColor)
  const { quickAdjustments, scrubStep, scrubSteps, label } = playSystemRules(system).counter
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
  const steps = Math.max(
    -scrubSteps,
    Math.min(scrubSteps, Math.round((preview - start.current.life) / scrubStep)),
  )
  const compact = Math.min(cardWidth, cardHeight) > 0 && Math.min(cardWidth, cardHeight) < 220
  const thumbLeft = `${50 + (steps / scrubSteps) * 50}%` as const
  const trackInset = compact ? 10 : 18
  const balloonTarget =
    trackInset +
    Math.max(
      balloonWidth / 2,
      Math.min(trackWidth - balloonWidth / 2, trackWidth * (0.5 + steps / (2 * scrubSteps))),
    )
  const thumbTarget = trackInset + trackWidth * (0.5 + steps / (2 * scrubSteps))
  const actions = [
    -quickAdjustments[0],
    -quickAdjustments[1],
    quickAdjustments[1],
    quickAdjustments[0],
  ]
  const sideways = Math.abs(rotation) === 90 && cardWidth > 0 && cardHeight > 0
  const editorHeight = sideways ? cardWidth : cardHeight
  const valueFontSize = compact ? styles.compactValue.fontSize : styles.value.fontSize
  const safe = contentInsets ?? { top: 0, bottom: 0, left: 0, right: 0 }
  const physicalX = (safe.left - safe.right) / 2
  const physicalY = (safe.top - safe.bottom) / 2
  const sourceX =
    rotation === 180
      ? -physicalX
      : rotation === 90
        ? physicalY
        : rotation === -90
          ? -physicalY
          : physicalX
  const sourceY =
    rotation === 180
      ? -physicalY
      : rotation === 90
        ? -physicalX
        : rotation === -90
          ? physicalX
          : physicalY
  const valueStyle = useAnimatedStyle(() => ({
    opacity: valueCenter === null ? 0 : 1,
    transform: [
      { translateX: sourceX * (1 - valueProgress.value) },
      { translateY: (editorHeight / 2 + sourceY - (valueCenter ?? 0)) * (1 - valueProgress.value) },
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
  const headerPosition = lifeEditorHeaderPosition(rotation, contentInsets, menuCorner, compact)

  useEffect(() => {
    draft.current = life
    start.current.life = life
    setPreview(life)
  }, [life])

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
    edgeExtra.current = 0
    if (!direction) return
    edgeDirection.current = direction
    edgeDelay.current = setTimeout(() => {
      edgeRepeat.current = setInterval(() => {
        const nextDelta = draft.current - start.current.life + direction * scrubStep
        if (Math.abs(nextDelta) > MAX_LIFE_DELTA) return stopEdge()
        edgeExtra.current += direction * scrubStep
        draft.current += direction * scrubStep
        setPreview(draft.current)
      }, EDGE_REPEAT_MS)
    }, EDGE_DELAY_MS)
  }

  function apply(delta: number) {
    if (!delta || Math.abs(delta) > MAX_LIFE_DELTA) return
    onChange(delta)
    draft.current += delta
    start.current.life = draft.current
    setPreview(draft.current)
  }

  function drag(event: GestureResponderEvent) {
    const dx = event.nativeEvent.pageX - start.current.x
    const dy = event.nativeEvent.pageY - start.current.y
    const distance = rotation === 180 ? -dx : rotation === 90 ? dy : rotation === -90 ? -dy : dx
    const rawSteps = Math.round((distance / Math.max(trackWidth / 2, 1)) * scrubSteps)
    const clampedSteps = Math.max(-scrubSteps, Math.min(scrubSteps, rawSteps))
    holdEdge(rawSteps >= scrubSteps ? 1 : rawSteps <= -scrubSteps ? -1 : 0)
    draft.current = start.current.life + clampedSteps * scrubStep + edgeExtra.current
    setPreview(draft.current)
  }

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
      style={[
        styles.overlay,
        compact && styles.compactOverlay,
        rotatedBounds,
        {
          backgroundColor: editorColor,
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
          text={playerName}
          weight="bold"
          numberOfLines={1}
          style={[styles.title, { color: ink }]}
        />
        <Pressable
          testID={`life-editor-close-seat-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel="Close life controls"
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
        </Pressable>
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
          accessibilityLiveRegion="polite"
          style={[styles.value, compact && styles.compactValue, { color: ink }]}
        />
      </Animated.View>
      <View
        style={[
          styles.scrubArea,
          compact && styles.compactScrubArea,
          { paddingHorizontal: trackInset },
        ]}
      >
        {dragging ? (
          <Animated.View
            style={[styles.balloon, compact && styles.compactBalloon, balloonStyle]}
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
                text={deltaLabel(preview - start.current.life)}
                size={compact ? "lg" : "xl"}
                style={{ color: editorColor }}
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
          accessibilityLabel={`${playerName} ${label} change`}
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
            if (delta && Math.abs(delta) <= MAX_LIFE_DELTA) {
              onChange(delta)
              start.current.life = draft.current
            } else setPreview(start.current.life)
          }}
          onResponderTerminate={() => {
            stopEdge()
            setDragging(false)
            draft.current = start.current.life
            setPreview(draft.current)
          }}
          style={[styles.trackTouch, compact && styles.compactTrackTouch]}
        >
          <View
            style={[styles.track, { backgroundColor: theme.colors.board.border }]}
            pointerEvents="none"
          />
          <View
            style={[styles.center, { backgroundColor: theme.colors.board.text }]}
            pointerEvents="none"
          />
          <View
            style={[
              styles.thumb,
              compact && styles.compactThumb,
              { left: thumbLeft, backgroundColor: theme.colors.tint },
            ]}
            pointerEvents="none"
          />
        </View>
      </View>
      <View
        testID={`life-editor-actions-seat-${seatNumber}`}
        style={[styles.actions, compact && styles.compactActions]}
      >
        {actions.map((amount) => (
          <Pressable
            key={amount}
            testID={`life-editor-step-${seatNumber}-${amount}`}
            accessibilityRole="button"
            accessibilityLabel={`${amount > 0 ? "Add" : "Subtract"} ${Math.abs(amount)} ${label}`}
            onPress={() => apply(amount)}
            style={[
              styles.action,
              compact && styles.compactAction,
              { backgroundColor: theme.colors.board.surfaceRaised },
            ]}
          >
            <Text
              text={`${amount > 0 ? "+" : "−"}${Math.abs(amount).toLocaleString()}`}
              weight="bold"
              size={compact ? "xs" : "sm"}
              style={{ color: ink }}
            />
          </Pressable>
        ))}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
  },
  actions: { alignSelf: "stretch", flexDirection: "row", gap: 5, marginHorizontal: 8 },
  balloon: {
    alignItems: "center",
    bottom: 66,
    minWidth: 56,
    position: "absolute",
  },
  balloonBody: {
    alignItems: "center",
    borderRadius: 16,
    minWidth: 56,
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  balloonPointer: {
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    height: 0,
    width: 0,
  },
  center: { alignSelf: "center", height: 14, position: "absolute", width: 2 },
  closeButton: { alignItems: "center", height: 32, justifyContent: "center", width: 32 },
  closeStroke: { borderRadius: 1, height: 2, position: "absolute", width: 20 },
  compactAction: { minHeight: 36 },
  compactActions: { marginHorizontal: 6 },
  compactBalloon: { bottom: 42 },
  compactBalloonBody: { paddingVertical: 4 },
  compactOverlay: { gap: 4, padding: 6 },
  compactScrubArea: { height: 72 },
  compactThumb: { borderRadius: 15, height: 30, transform: [{ translateX: -15 }], width: 30 },
  compactTrackTouch: { height: 52 },
  compactValue: { fontSize: 36, lineHeight: 42 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    position: "absolute",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    padding: 12,
    zIndex: 20,
  },
  scrubArea: { height: 112, justifyContent: "flex-end", width: "90%" },
  thumb: {
    borderRadius: 18,
    height: 36,
    position: "absolute",
    transform: [{ translateX: -18 }],
    width: 36,
  },
  title: { flex: 1 },
  track: { borderRadius: 3, height: 6 },
  trackTouch: { height: 68, justifyContent: "center", width: "100%" },
  value: { fontSize: 48, fontVariant: ["tabular-nums"], lineHeight: 56 },
})
