import { useEffect, useRef, useState } from "react"
import type { LayoutChangeEvent, TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"
import * as Haptics from "expo-haptics"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"

import { localGameRepository } from "@/features/game/localPersistence"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { Text } from "./Text"

export interface Segment {
  id: string
  label: string
}

export interface SegmentedControlProps {
  segments: readonly Segment[]
  selectedId: string
  accessibilityLabel?: string
  testID?: string
  /** Renders the current selection without allowing a change. */
  disabled?: boolean
  onSelect: (id: string) => void
}

const TRACK_INSET = 3
const TRACK_BORDER_WIDTH = 1
const SEGMENT_PADDING = 4
// why: both springs are critically damped so the thumb never overshoots and swings back.
const SETTLE_SPRING = { stiffness: 400, damping: 40, mass: 1 } as const
const FOLLOW_SPRING = { stiffness: 1600, damping: 80, mass: 1 } as const
// why: iOS 26's swipe-from-anywhere back gesture won a movement-threshold race about 40% of the time; claiming the touch as it lands always wins.
const CLAIM_DELAY_MS = 1
const HELD_SCALE = 1.05

function fittingColumns(count: number, trackWidth: number, widestLabel: number) {
  if (trackWidth <= 0) return count
  const fits = (columns: number) => trackWidth / columns >= widestLabel + SEGMENT_PADDING * 2
  return [count, 2].find(fits) ?? 1
}

export function SegmentedControl({
  segments,
  selectedId,
  accessibilityLabel,
  testID,
  disabled = false,
  onSelect,
}: SegmentedControlProps) {
  const {
    themed,
    theme: { colors, radius },
  } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const [trackWidth, setTrackWidth] = useState(0)
  const [widestLabel, setWidestLabel] = useState(0)
  const offset = useSharedValue(0)
  const thumbScale = useSharedValue(1)
  const placedWidth = useRef(0)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const fingerIndex = useRef(0)
  const selectedIndex = Math.max(
    0,
    segments.findIndex((segment) => segment.id === selectedId),
  )
  const columns = fittingColumns(segments.length, trackWidth, widestLabel)
  const wrapped = columns < segments.length
  const segmentWidth = segments.length > 0 && !wrapped ? trackWidth / segments.length : 0
  const accent = colors.tint

  function measureTrack(event: LayoutChangeEvent) {
    const width = event.nativeEvent.layout.width - (TRACK_INSET + TRACK_BORDER_WIDTH) * 2
    setTrackWidth(width)
  }

  const dragging = dragIndex !== null
  const highlightedIndex = dragIndex ?? selectedIndex

  useEffect(() => {
    if (segmentWidth <= 0 || dragging) return
    const target = segmentWidth * selectedIndex
    // why: the first placement (and any resize) lands in place instead of sliding in from the left edge.
    const animate = placedWidth.current === segmentWidth && reducedMotion === false
    offset.set(animate ? withSpring(target, SETTLE_SPRING) : target)
    placedWidth.current = segmentWidth
  }, [dragging, offset, reducedMotion, segmentWidth, selectedIndex])

  function tick() {
    if (reducedMotion === false && localGameRepository.loadSettings().hapticsEnabled) {
      void Haptics.selectionAsync().catch(() => undefined)
    }
  }

  function select(id: string) {
    if (!disabled && id !== selectedId) onSelect(id)
  }

  function tap(id: string) {
    if (disabled || id === selectedId) return
    tick()
    onSelect(id)
  }

  function hold(held: boolean) {
    if (reducedMotion === false) thumbScale.set(withSpring(held ? HELD_SCALE : 1, SETTLE_SPRING))
  }

  function segmentAt(x: number) {
    return Math.min(Math.max(Math.floor(x / segmentWidth), 0), segments.length - 1)
  }

  function followFinger({ x: trackX }: { x: number }) {
    const maxOffset = segmentWidth * (segments.length - 1)
    const x = trackX - TRACK_INSET - TRACK_BORDER_WIDTH
    const target = Math.min(Math.max(x - segmentWidth / 2, 0), maxOffset)
    offset.set(reducedMotion === false ? withSpring(target, FOLLOW_SPRING) : target)
    const index = segmentAt(x)
    if (index !== fingerIndex.current) tick()
    fingerIndex.current = index
    setDragIndex(index)
    return index
  }

  const drag = Gesture.Pan()
    .enabled(!disabled && segments.length > 1)
    .runOnJS(true)
    // why: like iOS, only a touch that starts on the selection drags it; anywhere else stays a tap, a scroll, or a back swipe.
    .hitSlop({
      left: -(TRACK_INSET + TRACK_BORDER_WIDTH + segmentWidth * selectedIndex),
      width: segmentWidth,
    })
    .activateAfterLongPress(CLAIM_DELAY_MS)
    .onStart((event) => {
      fingerIndex.current = selectedIndex
      hold(true)
      followFinger(event)
    })
    .onUpdate(followFinger)
    .onEnd((event, success) => {
      const segment = segments[followFinger(event)]
      if (success && segment) select(segment.id)
    })
    .onFinalize(() => {
      hold(false)
      setDragIndex(null)
    })
  if (testID) drag.withTestId(`${testID}-drag`)

  const $thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }, { scale: thumbScale.get() }],
  }))

  return (
    <GestureDetector gesture={drag}>
      <View
        testID={testID}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        style={[themed($track), wrapped && $wrappedTrack, disabled ? $dimmed : undefined]}
        onLayout={measureTrack}
      >
        <View
          pointerEvents="none"
          aria-hidden
          testID={testID ? `${testID}-ruler` : undefined}
          style={$labelRuler}
          onLayout={(event) => setWidestLabel(event.nativeEvent.layout.width)}
        >
          {segments.map((segment) => (
            <SegmentLabel key={segment.id} label={segment.label} />
          ))}
        </View>
        {segmentWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[themed($thumbShape), { width: segmentWidth, backgroundColor: accent }, $thumb]}
          />
        ) : null}
        {segments.map((segment, index) => {
          const selected = segment.id === selectedId
          const highlighted = index === highlightedIndex
          return (
            <Pressable
              key={segment.id}
              testID={testID ? `${testID}-${segment.id}` : undefined}
              accessibilityRole="tab"
              aria-selected={selected}
              disabled={disabled}
              style={[
                $segment,
                // why: on Android, percentage flexBasis collapsed wrapped segments to empty slivers at large font scales.
                wrapped ? { width: Math.floor(trackWidth / columns) } : $fill,
                // why: the thumb carries the accent; filling the target too made it flash before the thumb arrived.
                selected &&
                  segmentWidth <= 0 && {
                    backgroundColor: accent,
                    borderRadius: radius.lg - TRACK_INSET,
                  },
              ]}
              onPress={() => tap(segment.id)}
            >
              <SegmentLabel
                label={segment.label}
                color={highlighted ? accessibleForeground(accent) : colors.text}
              />
            </Pressable>
          )
        })}
      </View>
    </GestureDetector>
  )
}

const $track: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  flexDirection: "row",
  padding: TRACK_INSET,
  borderRadius: radius.lg,
  borderWidth: TRACK_BORDER_WIDTH,
  borderColor: colors.border,
  backgroundColor: colors.palette.neutral100,
})
const $thumbShape: ThemedStyle<ViewStyle> = ({ radius }) => ({
  position: "absolute",
  top: TRACK_INSET,
  bottom: TRACK_INSET,
  left: TRACK_INSET,
  borderRadius: radius.lg - TRACK_INSET,
})
const $wrappedTrack: ViewStyle = { flexWrap: "wrap" }
const $fill: ViewStyle = { flex: 1 }
const $segment: ViewStyle = {
  minHeight: 46,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: SEGMENT_PADDING,
}
const $segmentLabel: TextStyle = { textAlign: "center" }
const $labelRuler: ViewStyle = { position: "absolute", top: 0, left: 0, opacity: 0 }
const $dimmed: ViewStyle = { opacity: 0.5 }

function SegmentLabel({ label, color }: { label: string; color?: string }) {
  return (
    <Text
      text={label}
      size="xs"
      weight="medium"
      numberOfLines={1}
      maxFontSizeMultiplier={1.4}
      style={[$segmentLabel, color ? { color } : undefined]}
    />
  )
}
