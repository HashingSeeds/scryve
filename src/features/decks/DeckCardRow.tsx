import { TouchableOpacity, View } from "react-native"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import Svg, { Path } from "react-native-svg"

import { CardImage } from "@/components/CardImage"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { printingKey, type DeckCard } from "./deckCards"
import { isCommanderPick } from "./deckDraft"

export function DeckCardRow({
  card,
  game,
  format,
  editing,
  subtitle,
  disabled,
  onFocus,
  onIncrement,
  onDecrement,
  move,
  testID,
  imageTestID,
  imageSource,
}: {
  card: DeckCard
  game: string
  format: string
  editing: boolean
  subtitle?: string
  disabled?: boolean
  onFocus: (card: DeckCard) => void
  onIncrement: (card: DeckCard) => void
  onDecrement: (card: DeckCard) => void
  move?: { label: string; onPress: () => void }
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
        <View style={$flex}>
          <Text size="sm" weight="medium" text={card.name} numberOfLines={2} />
          {subtitle ? <Text size="xxs" tone="dim" text={subtitle} numberOfLines={1} /> : null}
        </View>
      </TouchableOpacity>
      {editing ? (
        <View style={$row}>
          {move ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={move.label}
              disabled={disabled}
              style={$touch}
              onPress={move.onPress}
            >
              <Svg
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.colors.textDim}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
              </Svg>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={
              card.quantity === 1
                ? translate("decks:cardRow.remove", { card: card.name })
                : translate("decks:cardRow.decrease", { card: card.name })
            }
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
            accessibilityLabel={translate("decks:cardRow.increase", { card: card.name })}
            disabled={disabled || card.quantity >= 999 || isCommanderPick({ game, format }, card)}
            style={$touch}
            onPress={() => onIncrement(card)}
          >
            <Text text="+" style={themed($action)} />
          </TouchableOpacity>
        </View>
      ) : (
        <Text size="sm" text={`${card.quantity}×`} tone="dim" />
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
        <TextAction
          testID="choose-commander"
          accessibilityLabel={
            quantity
              ? translate("decks:cardRow.changeCommander")
              : translate("decks:cardRow.chooseCommander")
          }
          tx={quantity ? "decks:cardRow.change" : "decks:cardRow.choose"}
          size="xs"
          disabled={disabled}
          style={$touch}
          onPress={onChooseCommander}
        />
      ) : (
        <Text size="sm" tone="dim" text={String(quantity)} />
      )}
    </View>
  )
}

export function DeckCardListSkeleton({
  sections,
  commanderAction,
}: {
  sections: readonly { id: string; label: string }[]
  commanderAction: boolean
}) {
  const { themed } = useAppTheme()
  return sections.slice(0, 2).map((section, sectionIndex) => (
    <View key={section.id}>
      <View style={themed($section)}>
        <Text size="sm" weight="semiBold" text={section.label} style={$flex} />
        {commanderAction && section.id === "commander" ? <View style={$touch} /> : null}
      </View>
      {Array.from({ length: sectionIndex === 0 ? 1 : 3 }).map((_, index) => (
        <View key={index} style={themed($card)}>
          <View style={themed($cardLink)}>
            <View style={[$image, themed($placeholder)]} />
            <View style={[themed($placeholder), $placeholderLine]} />
          </View>
        </View>
      ))}
    </View>
  ))
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
const $image: ImageStyle & ViewStyle = { width: 32, height: 45 }
const $placeholderLine: ViewStyle = { width: "64%", height: 14 }
const $placeholder: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.separator })
const $action: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
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
