import { Linking, TouchableOpacity, View } from "react-native"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"

import { CardImage } from "@/components/CardImage"
import { Text } from "@/components/Text"
import { formatCurrency, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { catalogDb } from "@/storage/catalogDb"
import type { StoredCollectionEntry } from "@/storage/localDbTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { updateCollectionEntry } from "./collectionStore"
import { cardKingdomCardUrl, tcgplayerCardUrl } from "./storeLinks"
import { CONDITION_MULTIPLIERS, type CardCondition } from "../../../convex/lib/cardPricing"

function entryDetail(
  entry: Pick<StoredCollectionEntry, "setCode" | "collectorNumber" | "finish" | "condition">,
) {
  const { finish, condition } = entry
  return joinParts([
    entry.setCode.toUpperCase(),
    entry.collectorNumber ? `#${entry.collectorNumber}` : "",
    finish === "foil" || finish === "etched" ? translate(`decks:cardScan.finish.${finish}`) : "",
    condition !== "NM" && condition in CONDITION_MULTIPLIERS
      ? translate(`decks:cardScan.condition.${condition as CardCondition}`)
      : "",
  ])
}

export function CollectionEntryRow({
  entry,
  retailCents,
  buylistCents,
  onEdit,
}: {
  entry: StoredCollectionEntry
  retailCents: number
  buylistCents: number
  onEdit: () => void
}) {
  const { themed } = useAppTheme()
  const prices = joinParts([
    retailCents > 0 ? formatCurrency(retailCents, "USD") : "",
    buylistCents > 0
      ? translate("decks:cardScan.buylistShort", { value: formatCurrency(buylistCents, "USD") })
      : "",
  ])
  return (
    <View style={themed($row)}>
      <View style={themed($copy)}>
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
            <Text size="meta" tone="dim" numberOfLines={1} text={entryDetail(entry)} />
            {prices ? <Text size="meta" tone="dim" numberOfLines={1} text={prices} /> : null}
          </View>
        </TouchableOpacity>
        <View style={themed($links)}>
          <TouchableOpacity
            accessibilityRole="link"
            hitSlop={LINK_HIT_SLOP}
            style={$link}
            onPress={() => {
              const printing = catalogDb.getPrinting(entry.game, entry.printingId)
              void Linking.openURL(
                tcgplayerCardUrl({
                  name: entry.name,
                  setCode: entry.setCode,
                  tcgplayerId: printing?.tcgplayerId,
                }),
              )
            }}
          >
            <Text
              size="meta"
              numberOfLines={1}
              style={themed($linkText)}
              tx="decks:collection.tcgplayer"
            />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="link"
            hitSlop={LINK_HIT_SLOP}
            style={$link}
            onPress={() =>
              void Linking.openURL(cardKingdomCardUrl({ name: entry.name }, { buylist: true }))
            }
          >
            <Text
              size="meta"
              numberOfLines={1}
              style={themed($linkText)}
              tx="decks:collection.cardKingdomBuylist"
            />
          </TouchableOpacity>
        </View>
      </View>
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

const THUMB_WIDTH = 32
// why: a 32 pt step button plus 6 pt on each side keeps the 44 pt touch target.
const STEP_HIT_SLOP = { left: 6, right: 6 }
const LINK_HIT_SLOP = { top: 8, bottom: 8 }

const $flex1: ViewStyle = { flex: 1 }
const $row: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 66,
  flexDirection: "row",
  alignItems: "center",
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $copy: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  paddingVertical: spacing.xs,
  gap: spacing.xxs,
})
const $lead: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})
const $thumb: ImageStyle = { width: THUMB_WIDTH, height: 45 }
const $links: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
  marginStart: THUMB_WIDTH + spacing.sm,
})
const $link: ViewStyle = { flexShrink: 1 }
const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $step: ViewStyle = {
  width: 32,
  minHeight: 44,
  alignItems: "center",
  justifyContent: "center",
}
const $stepGlyph: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
// why: a minimum width keeps the − button still while a count stays under three digits.
const $quantity: TextStyle = { minWidth: 28, textAlign: "center", fontVariant: ["tabular-nums"] }
