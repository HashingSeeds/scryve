import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"
import { type ImageStyle } from "expo-image"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { CardImage, type CardImageIdentity } from "@/components/CardImage"
import { DialogCard } from "@/components/DialogCard"
import { FilterPill } from "@/components/FilterPill"
import { RetryableError } from "@/components/RetryableError"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { readCardFaces } from "@/features/decks/cardFaces"
import type { CommanderColor } from "@/features/decks/deckCards"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export type FocusedCard = CardImageIdentity & {
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
  boardLabel: string
  commanderColor?: CommanderColor
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
  commanderEligibility?: string
  commanderLegality?: string
  colorIdentity?: string
  faceDetails?: string
  keywords?: string
  commanderRulesUpdatedAt?: string
}

export interface CardFocusDialogProps {
  card: FocusedCard
  details?: FocusedCardDetails
  detailsError?: string
  detailsRetryAfterMs?: number
  onRetryDetails?: () => void
  showQuantity?: boolean
  onIncrement?: () => void
  onDecrement?: () => void
  onSetCommander?: (color?: CommanderColor) => void
  onClose: () => void
}

const CARD_ASPECT_RATIO = 488 / 680

export const COMMANDER_COLORS = [
  { id: "W", label: "White" },
  { id: "U", label: "Blue" },
  { id: "B", label: "Black" },
  { id: "R", label: "Red" },
  { id: "G", label: "Green" },
] as const

export function cardColorIdentityLabel(details: FocusedCardDetails | undefined, name: string) {
  if (details?.colorIdentity === undefined) return undefined
  const colors = COMMANDER_COLORS.filter((color) => details.colorIdentity?.includes(color.id))
    .map((color) => color.label)
    .join(", ")
  const identity =
    details.commanderEligibility === "color-choice"
      ? colors
        ? `${colors} + chosen color`
        : "Choose a color"
      : colors || "Colorless"
  return `Color identity: ${identity}${name.includes(" // ") ? " · Both faces" : ""}`
}

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
  detailsRetryAfterMs,
  onRetryDetails,
  showQuantity = true,
  onIncrement,
  onDecrement,
  onSetCommander,
  onClose,
}: CardFocusDialogProps) {
  const { themed } = useAppTheme()
  const [commanderColor, setCommanderColor] = useState(card.commanderColor)
  const [faceIndex, setFaceIndex] = useState(0)
  const faces = readCardFaces(details?.faceDetails)
  const face = faces[faceIndex]
  const visibleDetails = face ?? details
  const visibleName = face?.name ?? card.name
  const needsColor = details?.commanderEligibility === "color-choice"
  const commanderProblem =
    !details?.commanderEligibility || !details?.commanderLegality
      ? "Commander eligibility not yet verified."
      : details.commanderEligibility === "ineligible"
        ? "This card cannot be a commander on its own."
        : details.commanderLegality !== "legal"
          ? "This card is not legal in Commander."
          : undefined
  const printing = details ? printingLine(details) : ""
  const colorIdentity = cardColorIdentityLabel(details, card.name)
  const smallImageUrl = face ? face.smallImageUrl : (details?.smallImageUrl ?? card.smallImageUrl)
  const displayImageUrl = face
    ? (face.imageUrl ?? smallImageUrl)
    : (details?.imageUrl ?? card.imageUrl ?? smallImageUrl)
  const cachedThumbnailUrl = displayImageUrl === smallImageUrl ? undefined : smallImageUrl
  const imageAccessibilityLabel = [
    visibleName,
    visibleDetails?.typeLine,
    visibleDetails?.oracleText,
  ]
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
        <Text preset="subheading" style={themed($name)} text={visibleName} />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close card details"
          style={themed($closeButton)}
          onPress={onClose}
        >
          <Text text="Close" weight="bold" style={themed($closeText)} />
        </TouchableOpacity>
      </View>
      {faces.length === 2 ? (
        <View style={themed($faceControls)}>
          {faces.map((entry, index) => (
            <FilterPill
              key={entry.name}
              testID={`card-face-${index}`}
              label={index === 0 ? "Front" : "Back"}
              selected={faceIndex === index}
              onPress={() => setFaceIndex(index)}
            />
          ))}
        </View>
      ) : null}
      <ScrollView
        style={$scrollBody}
        contentContainerStyle={themed($scrollContent)}
        showsVerticalScrollIndicator={false}
      >
        <CardImage
          game={card.game}
          cardId={faceIndex === 0 ? card.cardId : undefined}
          testID="card-focus-image"
          accessibilityLabel={imageAccessibilityLabel}
          source={displayImageUrl}
          placeholder={cachedThumbnailUrl}
          style={themed($cardImage)}
        />
        <View style={themed($details)}>
          {visibleDetails?.manaCost ? (
            <Text size="sm" style={themed($dimText)} text={visibleDetails.manaCost} />
          ) : null}
          {visibleDetails?.typeLine ? (
            <Text size="sm" style={themed($dimText)} text={visibleDetails.typeLine} />
          ) : null}
          {colorIdentity ? <Text size="sm" text={colorIdentity} /> : null}
          {visibleDetails?.oracleText ? <Text selectable text={visibleDetails.oracleText} /> : null}
          {printing ? <Text size="xs" style={themed($dimText)} text={printing} /> : null}
          {!details && !detailsError ? (
            <Text size="sm" style={themed($dimText)} text="Loading details…" />
          ) : null}
          {detailsError ? (
            onRetryDetails ? (
              <RetryableError
                message={detailsError}
                retryAfterMs={detailsRetryAfterMs}
                onRetry={onRetryDetails}
                testID="retry-card-details"
              />
            ) : (
              <AlertNote text={detailsError} />
            )
          ) : null}
        </View>
      </ScrollView>
      {onSetCommander ? (
        <View style={themed($details)}>
          {needsColor ? (
            <SelectField
              testID="commander-color"
              label="Commander color"
              options={COMMANDER_COLORS}
              value={commanderColor}
              onSelect={(color) =>
                setCommanderColor(COMMANDER_COLORS.find((option) => option.id === color)?.id)
              }
            />
          ) : null}
          {commanderProblem ? <Text size="xs" text={commanderProblem} /> : null}
          <Button
            testID="set-commander"
            text="Set as commander"
            disabled={Boolean(commanderProblem) || (needsColor && !commanderColor)}
            onPress={() => onSetCommander(needsColor ? commanderColor : undefined)}
          />
        </View>
      ) : null}
      {showQuantity ? (
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
      ) : null}
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
const $faceControls: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.xs,
  paddingVertical: spacing.xs,
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
