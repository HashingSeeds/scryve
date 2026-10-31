import { TouchableOpacity, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"
import Svg, { Circle, Path } from "react-native-svg"

import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { decorativeSvgProps } from "@/utils/decorativeSvgProps"

import type { DeckAnalysis } from "./deckAnalysis"

const CURVE_HEIGHT = 30

export function DeckBuildTools({
  analysis,
  analysisPending,
  findDisabled,
  onFind,
  onAnalysis,
}: {
  analysis?: DeckAnalysis
  analysisPending?: boolean
  findDisabled?: boolean
  onFind: () => void
  onAnalysis: () => void
}) {
  const { themed, theme } = useAppTheme()
  const tallest = Math.max(1, ...(analysis?.curve ?? []))
  return (
    <View style={themed($tools)}>
      {analysis ? (
        <View style={themed($summary)} testID="deck-curve-strip">
          <View style={themed($curve)}>
            {analysis.curve.map((count, value) => (
              <View
                key={value}
                style={[themed($bar), { height: Math.max(2, (count / tallest) * CURVE_HEIGHT) }]}
              />
            ))}
          </View>
          <View style={themed($stats)}>
            <Stat
              label={translate("decks:build.average")}
              value={analysis.averageManaValue.toFixed(1)}
            />
            <Stat label={translate("decks:analysis.lands")} value={String(analysis.lands)} />
            <Stat label={translate("decks:analysis.ramp")} value={String(analysis.ramp)} />
          </View>
          <TextAction
            testID="open-deck-analysis"
            tx="decks:build.analysis"
            size="xs"
            style={$touch}
            onPress={onAnalysis}
          />
        </View>
      ) : analysisPending ? (
        <View style={[themed($summary), $touch]} />
      ) : null}
      <TouchableOpacity
        testID="deck-add-cards"
        accessibilityRole="button"
        accessibilityLabel={translate("decks:build.find")}
        accessibilityState={{ disabled: findDisabled }}
        disabled={findDisabled}
        style={[themed($find), findDisabled && $disabled]}
        onPress={onFind}
      >
        <Svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.colors.textDim}
          strokeWidth={2}
          {...decorativeSvgProps({ accessibilityElementsHidden: true })}
        >
          <Circle cx={11} cy={11} r={7} />
          <Path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </Svg>
        <Text tone="dim" tx="decks:build.find" />
      </TouchableOpacity>
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={$stat} accessible accessibilityLabel={`${label} ${value}`}>
      <Text size="xxs" tone="dim" text={label} />
      <Text size="xxs" weight="semiBold" style={$tabular} text={value} />
    </View>
  )
}

const $disabled: ViewStyle = { opacity: 0.4 }
const $tabular: TextStyle = { fontVariant: ["tabular-nums"] }
const $touch: ViewStyle = { minHeight: 44, justifyContent: "center" }
const $stat: ViewStyle = { flexDirection: "row", alignItems: "baseline", gap: 4 }
const $tools: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingTop: spacing.sm,
})
const $find: ThemedStyle<ViewStyle> = ({ colors, radius, spacing }) => ({
  minHeight: 44,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  borderWidth: 1,
  borderRadius: radius.sm,
  borderColor: colors.border,
  backgroundColor: colors.background,
})
const $summary: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $stats: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  flexWrap: "wrap",
  columnGap: spacing.sm,
})
const $curve: ThemedStyle<ViewStyle> = () => ({
  height: CURVE_HEIGHT,
  flexDirection: "row",
  alignItems: "flex-end",
  gap: 2,
})
const $bar: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 6,
  backgroundColor: colors.border,
  borderTopLeftRadius: radius.xxs,
  borderTopRightRadius: radius.xxs,
})
