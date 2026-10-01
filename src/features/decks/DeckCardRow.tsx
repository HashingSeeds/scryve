import { TouchableOpacity, View } from "react-native"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import Svg, { Path } from "react-native-svg"

import { CardImage } from "@/components/CardImage"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { cardSection, printingKey, type DeckCard } from "./deckCards"

export function DeckCardRow({
  card,
  game,
  format,
  editing,
  disabled,
  onFocus,
  onIncrement,
  onDecrement,
  testID,
  imageTestID,
  imageSource,
}: {
  card: DeckCard
  game: string
  format: string
  editing: boolean
  disabled?: boolean
  onFocus: (card: DeckCard) => void
  onIncrement: (card: DeckCard) => void
  onDecrement: (card: DeckCard) => void
  testID?: string
  imageTestID?: string
  imageSource?: string
}) {
  const { themed, theme } = useAppTheme()
  return (
    <View style={themed($card)}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${card.quantity}× ${card.name}`}
        testID={testID ?? `deck-card-row-${printingKey(card)}`}
        style={themed($cardLink)}
        onPress={() => onFocus(card)}
      >
        <CardImage
          game={game}
          cardId={card.scryfallId ?? card.cardId ?? card.printingId ?? card.providerCardId}
          source={imageSource ?? card.smallImageUrl ?? card.imageUrl}
          accessibilityLabel={card.name}
          compact
          testID={imageTestID}
          style={$image}
        />
        <Text size="sm" weight="medium" text={card.name} style={$flex} numberOfLines={2} />
      </TouchableOpacity>
      {editing ? (
        <View style={$row}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${card.quantity === 1 ? "Remove" : "Decrease"} ${card.name}`}
            disabled={disabled}
            style={$touch}
            onPress={() => onDecrement(card)}
          >
            {card.quantity === 1 ? (
              <Svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.colors.brandText}
                strokeWidth={1.6}
              >
                <Path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />
              </Svg>
            ) : (
              <Text text="−" style={themed($action)} />
            )}
          </TouchableOpacity>
          <Text size="sm" text={String(card.quantity)} style={$quantity} />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Increase ${card.name}`}
            disabled={
              disabled ||
              card.quantity >= 999 ||
              (game === "mtg" && format === "commander" && cardSection(card) === "commander")
            }
            style={$touch}
            onPress={() => onIncrement(card)}
          >
            <Text text="+" style={themed($action)} />
          </TouchableOpacity>
        </View>
      ) : (
        <Text size="sm" text={`${card.quantity}×`} style={themed($dim)} />
      )}
    </View>
  )
}

export function DeckCardSectionHeader({
  label,
  quantity,
  onChooseCommander,
  disabled,
}: {
  label: string
  quantity: number
  onChooseCommander?: () => void
  disabled?: boolean
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($section)}>
      <Text size="sm" weight="semiBold" text={label} style={$flex} />
      {onChooseCommander ? (
        <TouchableOpacity
          testID="choose-commander"
          accessibilityRole="button"
          accessibilityLabel={quantity ? "Change commander" : "Choose commander"}
          disabled={disabled}
          style={$touch}
          onPress={onChooseCommander}
        >
          <Text size="xs" style={themed($action)} text={quantity ? "Change" : "Choose"} />
        </TouchableOpacity>
      ) : (
        <Text size="sm" style={themed($dim)} text={String(quantity)} />
      )}
    </View>
  )
}

const $flex: ViewStyle = { flex: 1 }
const $row: ViewStyle = { flexDirection: "row", alignItems: "center" }
const $touch: ViewStyle = {
  minWidth: 44,
  minHeight: 44,
  alignItems: "center",
  justifyContent: "center",
}
const $quantity: TextStyle = { minWidth: 18, textAlign: "center", fontVariant: ["tabular-nums"] }
const $image: ImageStyle = { width: 32, height: 45 }
const $action: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingTop: spacing.lg,
  paddingBottom: spacing.xs,
})
const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 66,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $cardLink: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
})
