import { useState } from "react"
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"

import { appLocale } from "@/i18n"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"

import { BoardPressable } from "./BoardPressable"
import { Text } from "./Text"

type Size = "compact" | "regular"

export interface StepChipsProps {
  steps: readonly number[]
  onStep: (step: number) => void
  ink: string
  size?: Size
  testID: string
  accessibilityLabel: (step: number) => string
  style?: StyleProp<ViewStyle>
}

const HEIGHT: Record<Size, number> = { regular: 42, compact: 36 }
const GAP: Record<Size, number> = { regular: 5, compact: 4 }

export function stepChipsHeight(size: Size = "regular") {
  return HEIGHT[size]
}

export function mirroredSteps(magnitudes: readonly number[]) {
  const sizes = [...new Set(magnitudes.map(Math.abs))].filter(Boolean).sort((a, b) => b - a)
  return [...sizes.map((size) => -size), ...[...sizes].reverse()]
}

/** why: a truncated "−…" chip reads as no step at all, so a tight row drops its largest sizes first and keeps its finest. */
export function fittingSteps(
  steps: readonly number[],
  rowWidth: number,
  labelWidth: (step: number) => number,
  gap: number,
) {
  const sizes = [...new Set(steps.map(Math.abs))].sort((a, b) => a - b)
  for (let count = sizes.length; count > 1; count--) {
    const kept = steps.filter((step) => sizes.indexOf(Math.abs(step)) < count)
    const chipWidth = (rowWidth - gap * (kept.length - 1)) / kept.length
    if (kept.every((step) => labelWidth(step) <= chipWidth)) return kept
  }
  return steps.filter((step) => Math.abs(step) === sizes[0])
}

export function stepLabel(step: number) {
  return `${step < 0 ? "−" : "+"}${Math.abs(step).toLocaleString(appLocale)}`
}

export function StepChips({
  steps,
  onStep,
  ink,
  size = "regular",
  testID,
  accessibilityLabel,
  style,
}: StepChipsProps) {
  const { theme } = useAppTheme()
  const [rowWidth, setRowWidth] = useState<number>()
  const [labelWidths, setLabelWidths] = useState<ReadonlyMap<number, number>>(new Map())
  const measured = rowWidth !== undefined && steps.every((step) => labelWidths.has(step))
  const shown = measured
    ? fittingSteps(steps, rowWidth, (step) => labelWidths.get(step) ?? 0, GAP[size])
    : steps
  const label = (step: number, color?: string) => (
    <Text
      text={stepLabel(step)}
      weight="bold"
      size={size === "compact" ? "xs" : "sm"}
      numberOfLines={1}
      style={[styles.label, color !== undefined && { color }]}
    />
  )

  return (
    <View
      testID={testID}
      onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
      style={[styles.row, { gap: GAP[size] }, style]}
    >
      {/* why: each label's natural width, measured off screen at the row's own type size, decides how many steps the row can show untruncated. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.measure}
      >
        <View style={styles.measureRow}>
          {steps.map((step) => (
            <View
              key={step}
              testID={`${testID}-measure-${step}`}
              onLayout={(event) => {
                const width = event.nativeEvent.layout.width
                setLabelWidths((current) =>
                  current.get(step) === width ? current : new Map(current).set(step, width),
                )
              }}
            >
              {label(step)}
            </View>
          ))}
        </View>
      </View>
      {shown.map((step) => (
        <BoardPressable
          key={step}
          testID={`${testID}-${step}`}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel(step)}
          onPress={() => onStep(step)}
          style={({ pressed }) => [
            styles.chip,
            { height: HEIGHT[size], backgroundColor: theme.colors.board.surfaceRaised },
            pressed && styles.pressed,
          ]}
        >
          {label(step, ink)}
        </BoardPressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    borderRadius: radius.md,
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  label: { fontVariant: ["tabular-nums"] },
  measure: {
    height: 0,
    left: 0,
    opacity: 0,
    overflow: "hidden",
    position: "absolute",
    top: 0,
    width: 0,
  },
  measureRow: { alignItems: "flex-start", flexDirection: "row", width: 10_000 },
  pressed: { opacity: 0.75 },
  row: { alignSelf: "stretch", flexDirection: "row" },
})
