import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { Image, type ImageStyle } from "expo-image"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { DialogCard } from "@/components/DialogCard"
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
  const displayImageUrl = card.imageUrl ?? card.smallImageUrl
  const cachedThumbnailUrl = displayImageUrl === card.smallImageUrl ? undefined : card.smallImageUrl

  return (
    <DialogCard
      visible
      wide
      style={themed($dialog)}
      onClose={onClose}
      backdropTestID="card-focus-backdrop"
      backdropAccessibilityLabel="Close card details"
      dialogTestID="card-focus-dialog"
      accessibilityViewIsModal
    >
      <View style={themed($header)}>
        <Text weight="medium" text="Card details" />
        <Button
          text="×"
          accessibilityLabel="Close"
          testID="card-focus-close"
          style={themed($closeButton)}
          textStyle={$closeButtonText}
          onPress={onClose}
        />
      </View>
      <ScrollView
        style={$scrollBody}
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        <View style={themed($identity)}>
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
              <Text size="xs" style={themed($dimText)} text={card.name} />
            </View>
          )}
          <View style={themed($identityDetails)}>
            <Text size="xxs" style={themed($sectionLabel)} text={card.boardLabel} />
            <Text preset="subheading" text={card.name} />
            {details?.manaCost ? (
              <Text size="xs" style={themed($manaCost)} text={details.manaCost} />
            ) : null}
            {details?.typeLine ? (
              <Text size="xs" style={themed($dimText)} text={details.typeLine} />
            ) : null}
          </View>
        </View>
        {details?.oracleText ? (
          <View style={themed($section)}>
            <Text size="xxs" style={themed($sectionLabel)} text="Oracle text" />
            <Text selectable text={details.oracleText} />
          </View>
        ) : null}
        {printing ? (
          <View style={themed($section)}>
            <Text size="xxs" style={themed($sectionLabel)} text="Printing" />
            <Text size="sm" text={printing} />
          </View>
        ) : null}
        <View style={themed($statusSection)}>
          {!details && !detailsError ? (
            <Text size="sm" style={themed($dimText)} text="Loading details…" />
          ) : null}
          {detailsError ? <AlertNote text={detailsError} /> : null}
        </View>
      </ScrollView>
      <View style={themed($quantityRow)}>
        <Text size="sm" style={themed($quantityLabel)} text={`Copies in ${card.boardLabel}`} />
        {onDecrement ? (
          <Button
            text="−"
            testID="card-focus-decrement"
            style={themed($quantityButton)}
            onPress={onDecrement}
          />
        ) : null}
        <Text
          testID="card-focus-quantity"
          weight="bold"
          style={$quantityValue}
          text={String(card.quantity)}
        />
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

const $scrollBody = { flexGrow: 0, flexShrink: 1 } as const
const $dialog: ThemedStyle<ViewStyle> = () => ({ gap: 0, padding: 0, overflow: "hidden" })
const $header: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 56,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingLeft: spacing.lg,
  paddingRight: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $closeButton: ThemedStyle<ViewStyle> = () => ({
  minWidth: 48,
  minHeight: 48,
  paddingHorizontal: 0,
  paddingVertical: 0,
  borderWidth: 0,
  backgroundColor: "transparent",
})
const $closeButtonText: TextStyle = { fontSize: 28, lineHeight: 30 }
const $scrollContent: ThemedStyle<ViewStyle> = () => ({})
const $identity: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
  padding: spacing.lg,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $identityDetails: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  alignSelf: "center",
  gap: spacing.xxs,
})
const $cardImage: ThemedStyle<ImageStyle> = ({ spacing }) => ({
  width: 120,
  aspectRatio: CARD_ASPECT_RATIO,
  borderRadius: spacing.sm,
})
const $imagePlaceholder: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 120,
  aspectRatio: CARD_ASPECT_RATIO,
  alignItems: "center",
  justifyContent: "center",
  padding: spacing.md,
  borderRadius: spacing.sm,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.separator,
})
const $dimText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $manaCost: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.textDim,
  fontFamily: typography.primary.medium,
})
const $section: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  padding: spacing.lg,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $sectionLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.textDim,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.4,
})
const $statusSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingHorizontal: spacing.lg,
})
const $quantityRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  minHeight: 72,
  paddingHorizontal: spacing.lg,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
})
const $quantityLabel: ThemedStyle<TextStyle> = ({ colors }) => ({
  flexGrow: 1,
  flexShrink: 1,
  color: colors.textDim,
})
const $quantityValue: TextStyle = { width: 32, textAlign: "center" }
const $quantityButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  minWidth: 44,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.sm,
})
