import { View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { FilterPill } from "@/components/FilterPill"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import {
  deckStatLines,
  STATS_SOURCES,
  type DeckStatsRecord,
  type StatsSource,
} from "./deckStatLines"

export function DeckStats({
  record,
  source,
  onSourceChange,
}: {
  record: DeckStatsRecord
  source: StatsSource
  onSourceChange: (source: StatsSource) => void
}) {
  const { themed } = useAppTheme()
  const lines = deckStatLines(record, source)
  return (
    <View testID="deck-stats" style={themed($stats)}>
      <View style={themed($lines)}>
        {lines.length === 0 ? (
          <Text size="xs" style={themed($dim)} text="No results yet" />
        ) : (
          lines.map((line) => (
            <View
              key={line.label}
              testID={`deck-stats-line-${line.label.toLowerCase()}`}
              style={themed($line)}
            >
              <Text size="xs" style={themed($dim)} text={line.label} />
              <Text size="sm" weight="medium" style={$tabularNumbers} text={line.text} />
            </View>
          ))
        )}
      </View>
      <View style={themed($pills)}>
        {STATS_SOURCES.map((option) => (
          <FilterPill
            key={option.value}
            testID={`deck-stats-source-${option.value}`}
            label={option.label}
            selected={source === option.value}
            onPress={() => onSourceChange(option.value)}
          />
        ))}
      </View>
    </View>
  )
}

const $stats: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: spacing.sm,
  flexWrap: "wrap",
})
const $lines: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxxs, minHeight: 24 })
const $line: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "baseline",
  gap: spacing.xs,
})
const $pills: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flexDirection: "row", gap: spacing.xs })
const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $tabularNumbers: TextStyle = { fontVariant: ["tabular-nums"] }
