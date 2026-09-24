import { useEffect, useRef, useState } from "react"
import type { GestureResponderEvent, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated"

import { MAX_LIFE_DELTA } from "@/features/game/domain"
import { playSystemRules, type PlaySystemId } from "@/features/game/playSystems"
import { useAppTheme } from "@/theme/context"
import { accessibleForeground } from "@/utils/colorContrast"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import type { LifeCardContentRotation } from "./playerCardTypes"
import { Text } from "./Text"

const SCRUB_STEPS = 20
const EDGE_DELAY_MS = 350
const EDGE_REPEAT_MS = 110
const BALLOON_SPRING = { damping: 30, stiffness: 340, mass: 0.7 }

function deltaLabel(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta}`
}

type Props = {
  seatNumber: number
  playerName: string
  life: number
  system?: PlaySystemId
  color: string
  rotation: LifeCardContentRotation
  cardWidth: number
  cardHeight: number
  onChange: (delta: number) => void
  onClose: () => void
}

export function LifeEditor({
  seatNumber,
  playerName,
  life,
  system,
  color,
  rotation,
  cardWidth,
  cardHeight,
  onChange,
  onClose,
}: Props) {
  const { theme } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const editorColor = mixColorsInLinearLight(color, "#000000", 0.82)
  const ink = accessibleForeground(editorColor)
  const { quickAdjustments, scrubStep, label } = playSystemRules(system).counter
  const [preview, setPreview] = useState(life)
  const [dragging, setDragging] = useState(false)
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
    -SCRUB_STEPS,
    Math.min(SCRUB_STEPS, Math.round((preview - start.current.life) / scrubStep)),
  )
  const compact = Math.min(cardWidth, cardHeight) > 0 && Math.min(cardWidth, cardHeight) < 220
  const thumbLeft = `${50 + (steps / SCRUB_STEPS) * 50}%` as const
  const trackInset = compact ? 10 : 18
  const balloonTarget =
    trackInset +
    Math.max(
      balloonWidth / 2,
      Math.min(trackWidth - balloonWidth / 2, trackWidth * (0.5 + steps / (2 * SCRUB_STEPS))),
    )
  const thumbTarget = trackInset + trackWidth * (0.5 + steps / (2 * SCRUB_STEPS))
  const actions = [
    -quickAdjustments[0],
    -quickAdjustments[1],
    quickAdjustments[1],
    quickAdjustments[0],
  ]
  const sideways = Math.abs(rotation) === 90 && cardWidth > 0 && cardHeight > 0
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

  useEffect(() => {
    draft.current = life
    start.current.life = life
    setPreview(life)
  }, [life])

  useEffect(() => {
    thumbX.value = thumbTarget
    balloonX.value = dragging ? withSpring(balloonTarget, BALLOON_SPRING) : balloonTarget
  }, [balloonTarget, balloonX, dragging, thumbTarget, thumbX])

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
    const rawSteps = Math.round((distance / Math.max(trackWidth / 2, 1)) * SCRUB_STEPS)
    const clampedSteps = Math.max(-SCRUB_STEPS, Math.min(SCRUB_STEPS, rawSteps))
    holdEdge(rawSteps >= SCRUB_STEPS ? 1 : rawSteps <= -SCRUB_STEPS ? -1 : 0)
    draft.current = start.current.life + clampedSteps * scrubStep + edgeExtra.current
    setPreview(draft.current)
  }

  return (
    <Animated.View
      testID={`life-editor-seat-${seatNumber}`}
      accessibilityViewIsModal
      entering={reducedMotion === false ? FadeIn.duration(180) : undefined}
      style={[
        styles.overlay,
        compact && styles.compactOverlay,
        rotatedBounds,
        {
          backgroundColor: editorColor,
          transform: [{ rotate: `${rotation}deg` }],
        },
      ]}
    >
      <View style={[styles.header, compact && styles.compactHeader]}>
        <Text
          text={`${playerName} · ${label}`}
          weight="bold"
          numberOfLines={1}
          style={[styles.title, { color: ink }]}
        />
        <Pressable
          testID={`life-editor-close-seat-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel="Close life controls"
          onPress={onClose}
          hitSlop={12}
        >
          <Text text="×" style={[styles.close, { color: ink }]} />
        </Pressable>
      </View>
      <Text
        text={String(preview)}
        accessibilityLiveRegion="polite"
        style={[styles.value, compact && styles.compactValue, { color: ink }]}
      />
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
      <View style={styles.actions}>
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
  actions: { flexDirection: "row", gap: 5, width: "100%" },
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
  close: { fontSize: 30, lineHeight: 32 },
  compactAction: { minHeight: 36 },
  compactBalloon: { bottom: 42 },
  compactBalloonBody: { paddingVertical: 4 },
  compactHeader: { left: 6, right: 6, top: 6 },
  compactOverlay: { gap: 4, padding: 6 },
  compactScrubArea: { height: 72 },
  compactThumb: { borderRadius: 15, height: 30, transform: [{ translateX: -15 }], width: 30 },
  compactTrackTouch: { height: 52 },
  compactValue: { fontSize: 36, lineHeight: 42 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 12,
    position: "absolute",
    right: 12,
    top: 12,
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
