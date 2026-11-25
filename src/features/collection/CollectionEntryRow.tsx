import { TouchableOpacity, View } from "react-native"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"

import { CardImage } from "@/components/CardImage"
import { Text } from "@/components/Text"
import { formatCurrency, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import type { StoredCollectionEntry } from "@/storage/localDbTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { updateCollectionEntry } from "./collectionStore"
import { CONDITION_MULTIPLIERS, type CardCondition } from "../../../convex/lib/cardPricing"

function entryDetail(
  entry: Pick<StoredCollectionEntry, "setCode" | "collectorNumber" | "finish" | "condition">,
  retailCents: number,
) {
  const { finish, condition } = entry
  return joinParts([
    entry.setCode.toUpperCase(),
    entry.collectorNumber ? `#${entry.collectorNumber}` : "",
    finish === "foil" || finish === "etched" ? translate(`decks:cardScan.finish.${finish}`) : "",
    condition !== "NM" && condition in CONDITION_MULTIPLIERS
      ? translate(`decks:cardScan.condition.${condition as CardCondition}`)
      : "",
    retailCents > 0 ? formatCurrency(retailCents, "USD") : "",
  ])
}

export function CollectionEntryRow({
  entry,
  retailCents,
  onEdit,
}: {
  entry: StoredCollectionEntry
  retailCents: number
  onEdit: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($row)}>
      <TouchableOpacity accessibilityRole="button" style={themed($lead)} onPress={onEdit}>
        <CardImage
          game={entry.game}
          source={entry.smallImageUrl ?? entry.imageUrl}
          compact
          style={$thumb}
          accessibilityLabel={entry.name}
        />
        <View style={$flex1}>
          <Text size="sm" weight="medium" numberOfLines={1} text={entry.name} />
          <Text size="meta" tone="dim" numberOfLines={1} text={entryDetail(entry, retailCents)} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={
          entry.quantity === 1
            ? translate("decks:cardRow.remove", { card: entry.name })
            : translate("decks:cardRow.decrease", { card: entry.name })
        }
        hitSlop={STEP_HIT_SLOP}
        style={$step}
        onPress={() => updateCollectionEntry(entry.id, { quantity: entry.quantity - 1 })}
      >
        <Text text="−" style={themed($stepGlyph)} />
      </TouchableOpacity>
      <Text size="sm" text={entry.quantity} style={$quantity} />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={translate("decks:cardRow.increase", { card: entry.name })}
        hitSlop={STEP_HIT_SLOP}
        style={$step}
        onPress={() => updateCollectionEntry(entry.id, { quantity: entry.quantity + 1 })}
      >
        <Text text="+" style={themed($stepGlyph)} />
      </TouchableOpacity>
    </View>
  )
}

// why: a 32 pt step button plus 6 pt on each side keeps the 44 pt touch target.
const STEP_HIT_SLOP = { left: 6, right: 6 }

const $flex1: ViewStyle = { flex: 1 }
const $row: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 66,
  flexDirection: "row",
  alignItems: "center",
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $lead: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
})
const $thumb: ImageStyle = { width: 32, height: 45 }
const $step: ViewStyle = {
  width: 32,
  minHeight: 44,
  alignItems: "center",
  justifyContent: "center",
}
const $stepGlyph: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
// why: a minimum width keeps the − button still while a count stays under three digits.
const $quantity: TextStyle = { minWidth: 28, textAlign: "center", fontVariant: ["tabular-nums"] }
