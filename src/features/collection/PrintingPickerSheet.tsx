import { useMemo, useState } from "react"
import { FlatList, TouchableOpacity, View } from "react-native"
import type { ImageStyle, ViewStyle } from "react-native"

import { CardImage } from "@/components/CardImage"
import { ChoiceButton } from "@/components/ChoiceButton"
import { Sheet } from "@/components/Sheet"
import { Text } from "@/components/Text"
import { formatCurrency, joinParts } from "@/i18n/format"
import { catalogDb } from "@/storage/catalogDb"
import type { CatalogPrinting } from "@/storage/catalogDbTypes"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"
import type { ThemedStyle } from "@/theme/types"

import { lookupPrintingPrice, normalizePrintingName, useCatalogSync } from "./catalogSync"
import type { CardCondition, CardFinish } from "../../../convex/lib/cardPricing"

const FINISHES: readonly CardFinish[] = ["nonfoil", "foil", "etched"]
const CONDITIONS: readonly CardCondition[] = ["NM", "LP", "MP", "HP", "DMG"]

export interface PrintingPickResult {
  printing: CatalogPrinting
  finish: CardFinish
  condition: CardCondition
  retailCents?: number
  buylistCents?: number
}

export function PrintingPickerSheet({
  visible,
  game,
  cardName,
  cardId,
  selectedPrintingId,
  initialFinish = "nonfoil",
  initialCondition = "NM",
  onPick,
  onClose,
}: {
  visible: boolean
  game: string
  cardName: string
  cardId?: string
  selectedPrintingId?: string
  initialFinish?: CardFinish
  initialCondition?: CardCondition
  onPick: (result: PrintingPickResult) => void
  onClose: () => void
}) {
  const { themed, theme } = useAppTheme()
  const { printingCount } = useCatalogSync(game, visible)
  const [finish, setFinish] = useState<CardFinish>(initialFinish)
  const [condition, setCondition] = useState<CardCondition>(initialCondition)

  const printings = useMemo(() => {
    if (!visible) return []
    void printingCount
    const byId = cardId ? catalogDb.findPrintingsByCardId(game, cardId) : []
    if (byId.length > 0) return byId
    return catalogDb.findPrintingsByName(game, normalizePrintingName(cardName))
  }, [visible, game, cardId, cardName, printingCount])

  return (
    <Sheet visible={visible} onClose={onClose} testID="printing-picker-sheet">
      <View style={themed($container)}>
        <Text preset="subheading" tx="decks:collection.pickPrinting" />
        <Text size="sm" style={{ color: theme.colors.textDim }} text={cardName} />

        <View style={themed($pillRow)}>
          {FINISHES.map((option) => (
            <ChoiceButton
              key={option}
              compact
              tx={`decks:cardScan.finish.${option}`}
              selected={finish === option}
              onPress={() => setFinish(option)}
            />
          ))}
        </View>

        <View style={themed($pillRow)}>
          {CONDITIONS.map((option) => (
            <ChoiceButton
              key={option}
              compact
              tx={`decks:cardScan.condition.${option}`}
              selected={condition === option}
              onPress={() => setCondition(option)}
            />
          ))}
        </View>

        {printings.length === 0 ? (
          <Text
            size="sm"
            style={{ color: theme.colors.textDim }}
            tx="decks:collection.noPrintings"
          />
        ) : (
          <FlatList
            data={printings}
            keyExtractor={(item) => item.printingId}
            style={$list}
            renderItem={({ item }) => {
              const supported = item.finishes.length === 0 || item.finishes.includes(finish)
              const price = supported
                ? lookupPrintingPrice(game, item.printingId, finish, condition)
                : {}
              const selected = item.printingId === selectedPrintingId
              return (
                <TouchableOpacity
                  testID={`printing-option-${item.printingId}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !supported }}
                  disabled={!supported}
                  style={[
                    themed($row),
                    selected && themed($selectedRow),
                    !supported && $disabledRow,
                  ]}
                  onPress={() => {
                    if (!supported) return
                    onPick({
                      printing: item,
                      finish,
                      condition,
                      retailCents: price.retailCents,
                      buylistCents: price.buylistCents,
                    })
                  }}
                >
                  <CardImage
                    game={game}
                    source={item.smallImageUrl ?? item.imageUrl}
                    compact
                    style={$thumb}
                    accessibilityLabel={item.name}
                  />
                  <View style={$meta}>
                    <Text
                      weight="medium"
                      numberOfLines={1}
                      text={item.setName ?? item.setCode.toUpperCase()}
                    />
                    <Text
                      size="xs"
                      style={{ color: theme.colors.textDim }}
                      text={joinParts([
                        item.setCode.toUpperCase(),
                        `#${item.collectorNumber}`,
                        item.rarity ?? "",
                      ])}
                    />
                  </View>
                  {price.retailCents !== undefined ? (
                    <Text weight="medium" text={formatCurrency(price.retailCents, "USD")} />
                  ) : null}
                </TouchableOpacity>
              )
            }}
          />
        )}
      </View>
    </Sheet>
  )
}

const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.md,
  gap: spacing.sm,
  maxHeight: 540,
})
const $pillRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $list: ViewStyle = { maxHeight: 340 }
const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  padding: spacing.xs,
  marginBottom: spacing.xs,
  borderRadius: radius.md,
  backgroundColor: colors.surface,
})
const $selectedRow: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.tint,
  borderWidth: 1.5,
})
const $disabledRow: ViewStyle = { opacity: 0.45 }
const $thumb: ImageStyle = { width: 38, height: 53 }
const $meta: ViewStyle = { flex: 1 }
