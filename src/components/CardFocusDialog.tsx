import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { Image, type ImageStyle } from "expo-image"

import { $alert, $alertText } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { $dialogActions, $dialogButton, DialogCard } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export type FocusedCard = {
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
  boardLabel: string
}

export type FocusedCardDetails = {
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
  onIncrement: () => void
  onDecrement: () => void
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
  const displayImageUrl = card.imageUrl ?? card.smallImageUrl
  const cachedThumbnailUrl = displayImageUrl === card.smallImageUrl ? undefined : card.smallImageUrl

  return (
    <DialogCard
      visible
      wide
      onClose={onClose}
      backdropTestID="card-focus-backdrop"
      backdropAccessibilityLabel="Close card details"
      dialogTestID="card-focus-dialog"
      accessibilityViewIsModal
    >
      <ScrollView
        style={$scrollBody}
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        {displayImageUrl ? (
          <Image
            testID="card-focus-image"
            accessibilityLabel={card.name}
            source={displayImageUrl}
            placeholder={cachedThumbnailUrl}
            style={themed($cardImage)}
            contentFit="contain"
            transition={150}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={themed($imagePlaceholder)}>
            <Text style={themed($dimText)} text={card.name} />
          </View>
        )}
        <View style={themed($details)}>
          <View style={themed($nameRow)}>
            <Text preset="subheading" style={themed($name)} text={card.name} />
            {details?.manaCost ? (
              <Text size="sm" style={themed($dimText)} text={details.manaCost} />
            ) : null}
          </View>
          {details?.typeLine ? (
            <Text size="sm" style={themed($dimText)} text={details.typeLine} />
          ) : null}
          {details?.oracleText ? <Text selectable text={details.oracleText} /> : null}
          {printing ? <Text size="xs" style={themed($dimText)} text={printing} /> : null}
          {!details && !detailsError ? (
            <Text size="sm" style={themed($dimText)} text="Loading details…" />
          ) : null}
          {detailsError ? (
            <View style={themed($alert)}>
              <Text accessibilityRole="alert" style={themed($alertText)} text={detailsError} />
            </View>
          ) : null}
        </View>
      </ScrollView>
      <View style={themed($quantityRow)}>
        <Text
          size="sm"
          style={themed($quantityLabel)}
          text={`${card.quantity}× in ${card.boardLabel}`}
        />
        <Button
          text="−"
          testID="card-focus-decrement"
          style={themed($quantityButton)}
          onPress={onDecrement}
        />
        <Button
          text="+"
          testID="card-focus-increment"
          style={themed($quantityButton)}
          onPress={onIncrement}
        />
      </View>
      <View style={themed($dialogActions)}>
        <Button text="Close" style={themed($dialogButton)} onPress={onClose} />
      </View>
    </DialogCard>
  )
}

const $scrollBody = { flexGrow: 0, flexShrink: 1 } as const
const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.lg })
const $cardImage: ThemedStyle<ImageStyle> = ({ spacing }) => ({
  alignSelf: "stretch",
  aspectRatio: CARD_ASPECT_RATIO,
  borderRadius: spacing.sm,
})
const $imagePlaceholder: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignSelf: "stretch",
  aspectRatio: CARD_ASPECT_RATIO,
  alignItems: "center",
  justifyContent: "center",
  padding: spacing.md,
  borderRadius: spacing.sm,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.separator,
})
const $details: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $nameRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $name: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })
const $dimText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $quantityRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
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
