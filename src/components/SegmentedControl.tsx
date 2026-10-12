import { useEffect, useState } from "react"
import type { LayoutChangeEvent, TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { CHOICE_RADIUS } from "./ChoiceButton"
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
const SLIDE_SPRING = { damping: 18, stiffness: 240, mass: 0.6 } as const

/** why: at large font scales a single row ellipsizes labels, so it falls back to two columns, then one. */
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
    theme: { colors },
  } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const [trackWidth, setTrackWidth] = useState(0)
  const [widestLabel, setWidestLabel] = useState(0)
  const offset = useSharedValue(0)
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

  useEffect(() => {
    if (segmentWidth <= 0) return
    const target = segmentWidth * selectedIndex
    offset.value = reducedMotion === false ? withSpring(target, SLIDE_SPRING) : target
  }, [offset, reducedMotion, segmentWidth, selectedIndex])

  function select(id: string) {
    if (!disabled && id !== selectedId) onSelect(id)
  }

  const $thumb = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }))

  return (
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
      {segments.map((segment) => {
        const selected = segment.id === selectedId
        return (
          <Pressable
            key={segment.id}
            testID={testID ? `${testID}-${segment.id}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            style={[
              $segment,
              wrapped && [$wrappedSegment, { flexBasis: `${100 / columns}%` }],
              selected && { backgroundColor: accent, borderRadius: CHOICE_RADIUS - TRACK_INSET },
            ]}
            onPress={() => select(segment.id)}
          >
            <SegmentLabel
              label={segment.label}
              color={selected ? accessibleForeground(accent) : colors.text}
            />
          </Pressable>
        )
      })}
    </View>
  )
}

const $track: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flexDirection: "row",
  padding: TRACK_INSET,
  borderRadius: CHOICE_RADIUS,
  borderWidth: TRACK_BORDER_WIDTH,
  borderColor: colors.border,
  backgroundColor: colors.palette.neutral100,
})
const $thumbShape: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: TRACK_INSET,
  bottom: TRACK_INSET,
  left: TRACK_INSET,
  borderRadius: CHOICE_RADIUS - TRACK_INSET,
})
const $wrappedTrack: ViewStyle = { flexWrap: "wrap" }
// why: an odd last cell keeps its column width instead of stretching across the row.
const $wrappedSegment: ViewStyle = { flexGrow: 0 }
const $segment: ViewStyle = {
  flex: 1,
  minHeight: 46,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: SEGMENT_PADDING,
}
const $segmentLabel: TextStyle = { textAlign: "center" }
// why: an unconstrained, invisible copy of the labels measures the widest one at the current font scale.
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
