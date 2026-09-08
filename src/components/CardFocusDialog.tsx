import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"
import { type ImageStyle } from "expo-image"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { CardImage, type CardImageIdentity } from "@/components/CardImage"
import { DialogCard } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export type FocusedCard = CardImageIdentity & {
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
  boardLabel: string
}

export type FocusedCardDetails = {
  imageUrl?: string
  smallImageUrl?: string
  manaCost?: string
  typeLine?: string
  oracleText?: string
  setName?: string
  collectorNumber?: string
  rarity?: string
}

export interface CardFocusDialogProps {
  card: FocusedCard
  details?: FocusedCardDetails
  detailsError?: string
  onIncrement?: () => void
  onDecrement?: () => void
  onClose: () => void
}

const CARD_ASPECT_RATIO = 488 / 680

function capitalized(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function printingLine(details: FocusedCardDetails) {
  return [
    details.setName,
    details.collectorNumber ? `#${details.collectorNumber}` : undefined,
    details.rarity ? capitalized(details.rarity) : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ")
}

export function CardFocusDialog({
  card,
  details,
  detailsError,
  onIncrement,
  onDecrement,
  onClose,
}: CardFocusDialogProps) {
  const { themed } = useAppTheme()
  const printing = details ? printingLine(details) : ""
  const smallImageUrl = details?.smallImageUrl ?? card.smallImageUrl
  const displayImageUrl = details?.imageUrl ?? card.imageUrl ?? smallImageUrl
  const cachedThumbnailUrl = displayImageUrl === smallImageUrl ? undefined : smallImageUrl
  const imageAccessibilityLabel = [card.name, details?.typeLine, details?.oracleText]
    .filter(Boolean)
    .join(". ")

  return (
    <DialogCard
      visible
      wide
      placement="bottom"
      style={$sheet}
      onClose={onClose}
      backdropTestID="card-focus-backdrop"
      backdropAccessibilityLabel="Close card details"
      dialogTestID="card-focus-dialog"
      accessibilityViewIsModal
    >
      <View style={themed($header)}>
        <Text preset="subheading" style={themed($name)} text={card.name} />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close card details"
          style={themed($closeButton)}
          onPress={onClose}
        >
          <Text text="Close" weight="bold" style={themed($closeText)} />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={$scrollBody}
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        <CardImage
          game={card.game}
          cardId={card.cardId}
          testID="card-focus-image"
          accessibilityLabel={imageAccessibilityLabel}
          source={displayImageUrl}
          placeholder={cachedThumbnailUrl}
          style={themed($cardImage)}
        />
        <View style={themed($details)}>
          {details?.manaCost ? (
            <Text size="sm" style={themed($dimText)} text={details.manaCost} />
          ) : null}
          {details?.typeLine ? (
            <Text size="sm" style={themed($dimText)} text={details.typeLine} />
          ) : null}
          {details?.oracleText ? <Text selectable text={details.oracleText} /> : null}
          {printing ? <Text size="xs" style={themed($dimText)} text={printing} /> : null}
          {!details && !detailsError ? (
            <Text size="sm" style={themed($dimText)} text="Loading details…" />
          ) : null}
          {detailsError ? <AlertNote text={detailsError} /> : null}
        </View>
      </ScrollView>
      <View testID="card-focus-quantity" style={themed($quantityRow)}>
        <Text
          size="sm"
          style={themed($quantityLabel)}
          text={`${card.quantity}× in ${card.boardLabel}`}
        />
        {onDecrement ? (
          <Button
            text="−"
            testID="card-focus-decrement"
            style={themed($quantityButton)}
            onPress={onDecrement}
          />
        ) : null}
        {onIncrement ? (
          <Button
            text="+"
            testID="card-focus-increment"
            style={themed($quantityButton)}
            onPress={onIncrement}
          />
        ) : null}
      </View>
    </DialogCard>
  )
}

const $sheet: ViewStyle = { height: "88%" }
const $scrollBody: ViewStyle = { flex: 1 }
const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $header: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 44,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $cardImage: ThemedStyle<ImageStyle> = ({ spacing }) => ({
  width: "52%",
  maxWidth: 180,
  alignSelf: "center",
  aspectRatio: CARD_ASPECT_RATIO,
  borderRadius: spacing.xs,
})
const $details: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $name: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })
const $closeButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  flexShrink: 0,
  justifyContent: "center",
  paddingStart: spacing.sm,
})
const $closeText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $dimText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $quantityRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingTop: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
})
const $quantityLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  flexGrow: 1,
  flexShrink: 1,
  color: colors.textDim,
})
const $quantityButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  minWidth: 44,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.sm,
})
