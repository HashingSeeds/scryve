import { View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { recordSummary } from "./deckCopy"
import { allRecord, type DeckStatsRecord } from "./deckStatLines"

export function DeckStats({ record }: { record: DeckStatsRecord }) {
  const { themed } = useAppTheme()
  const all = allRecord(record)
  return (
    <View testID="deck-stats" style={themed($stats)}>
      <Text size="sm" weight="medium" style={$tabularNumbers} text={recordSummary(all)} />
    </View>
  )
}

const $stats: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "baseline",
  gap: spacing.xs,
  minHeight: 24,
})
const $tabularNumbers: TextStyle = { fontVariant: ["tabular-nums"] }
