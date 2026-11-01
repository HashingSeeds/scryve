import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { type ImageStyle } from "expo-image"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { CardImage, type CardImageIdentity } from "@/components/CardImage"
import { CardSymbolText, spokenCardText } from "@/components/CardSymbolText"
import { PressableIcon } from "@/components/Icon"
import { RetryableError } from "@/components/RetryableError"
import { SegmentedControl } from "@/components/SegmentedControl"
import { SelectField } from "@/components/SelectField"
import { Sheet } from "@/components/Sheet"
import { Text } from "@/components/Text"
import { readCardFaces } from "@/features/decks/cardFaces"
import { isBackground } from "@/features/decks/commanderSelection"
import type { CommanderColor } from "@/features/decks/deckCards"
import { commanderNameWarning } from "@/features/decks/deckCopy"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { systemDefinition } from "../../convex/lib/systems"

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
  power?: string
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
  visible: boolean
  onClose: () => void
  onDismissed: () => void
}

const CARD_ASPECT_RATIO = 488 / 680

export const COMMANDER_COLORS = ["W", "U", "B", "R", "G"] as const

const COLOR_LABEL_KEYS = {
  W: "decks:colors.white",
  U: "decks:colors.blue",
  B: "decks:colors.black",
  R: "decks:colors.red",
  G: "decks:colors.green",
  C: "decks:colors.colorless",
} as const

export function colorLabel(id: keyof typeof COLOR_LABEL_KEYS) {
  return translate(COLOR_LABEL_KEYS[id])
}

export function cardColorIdentityLabel(details: FocusedCardDetails | undefined, name: string) {
  if (details?.colorIdentity === undefined) return undefined
  const colors = COMMANDER_COLORS.filter((color) => details.colorIdentity?.includes(color))
    .map(colorLabel)
    .join(", ")
  const identity =
    details.commanderEligibility === "color-choice"
      ? colors
        ? translate("decks:colors.withChosen", { colors })
        : translate("decks:colors.chooseColor")
      : colors || colorLabel("C")
  return name.includes(" // ")
    ? translate("decks:colors.identityBothFaces", { identity })
    : translate("decks:colors.identity", { identity })
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
  visible,
  onClose,
  onDismissed,
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
      ? translate("decks:cardFocus.eligibilityUnverified")
      : details.commanderEligibility === "ineligible" && !isBackground(details)
        ? translate("decks:cardFocus.ineligible")
        : details.commanderLegality !== "legal"
          ? translate("decks:cardFocus.notLegal")
          : undefined
  const nameWarning =
    onSetCommander && !commanderProblem ? commanderNameWarning(card.name) : undefined
  const printing = details ? printingLine(details) : ""
  const imageCredit = systemDefinition(card.game)?.integration.rights.imageCredit
  const colorIdentity = cardColorIdentityLabel(details, card.name)
  const smallImageUrl = face ? face.smallImageUrl : (details?.smallImageUrl ?? card.smallImageUrl)
  const displayImageUrl = face
    ? (face.imageUrl ?? smallImageUrl)
    : (details?.imageUrl ?? card.imageUrl ?? smallImageUrl)
  const cachedThumbnailUrl = displayImageUrl === smallImageUrl ? undefined : smallImageUrl
  const imageAccessibilityLabel = [
    visibleName,
    visibleDetails?.typeLine,
    visibleDetails?.oracleText && spokenCardText(card.game, visibleDetails.oracleText),
  ]
    .filter(Boolean)
    .join(". ")
  const closeLabel = translate("decks:cardFocus.close")

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      size="full"
      testID="card-focus-dialog"
    >
      <View style={themed($header)}>
        <Text preset="subheading" style={themed($name)} text={visibleName} />
        <PressableIcon
          testID="card-focus-close"
          icon="x"
          size={24}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          containerStyle={themed($closeButton)}
          onPress={onClose}
        />
      </View>
      {faces.length === 2 ? (
        <View style={themed($faceControls)}>
          <SegmentedControl
            testID="card-face"
            segments={[
              { id: "0", label: translate("decks:cardFocus.front") },
              { id: "1", label: translate("decks:cardFocus.back") },
            ]}
            selectedId={String(faceIndex)}
            onSelect={(id) => setFaceIndex(Number(id))}
          />
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
            <CardSymbolText
              game={card.game}
              size="sm"
              style={themed($dimText)}
              text={visibleDetails.manaCost}
            />
          ) : null}
          {visibleDetails?.typeLine ? (
            <Text size="sm" tone="dim" text={visibleDetails.typeLine} />
          ) : null}
          {colorIdentity ? <Text size="sm" text={colorIdentity} /> : null}
          {visibleDetails?.oracleText ? (
            <CardSymbolText game={card.game} selectable text={visibleDetails.oracleText} />
          ) : null}
          {printing ? <Text size="xs" tone="dim" text={printing} /> : null}
          {imageCredit ? <Text size="xxs" tone="dim" text={imageCredit} /> : null}
          {!details && !detailsError ? (
            <Text size="sm" tone="dim" tx="decks:cardFocus.loadingDetails" />
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
              label={translate("decks:cardFocus.commanderColor")}
              field="commanderColor"
              options={COMMANDER_COLORS.map((id) => ({ id, label: colorLabel(id) }))}
              value={commanderColor}
              onSelect={(color) => setCommanderColor(COMMANDER_COLORS.find((id) => id === color))}
            />
          ) : null}
          {commanderProblem ? <Text size="xs" text={commanderProblem} /> : null}
          {nameWarning ? (
            <Text size="xs" tone="dim" testID="commander-name-warning" text={nameWarning} />
          ) : null}
          <Button
            testID="set-commander"
            tx="decks:cardFocus.setCommander"
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
            text={translate("decks:cardFocus.quantityIn", {
              quantity: card.quantity,
              section: card.boardLabel,
            })}
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
    </Sheet>
  )
}

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
const $cardImage: ThemedStyle<ImageStyle> = ({ radius }) => ({
  width: "52%",
  maxWidth: 180,
  alignSelf: "center",
  aspectRatio: CARD_ASPECT_RATIO,
  borderRadius: radius.md,
})
const $faceControls: ThemedStyle<ViewStyle> = ({ spacing }) => ({ paddingVertical: spacing.xs })
const $details: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $name: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })
const $closeButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  minWidth: 44,
  flexShrink: 0,
  alignItems: "flex-end",
  justifyContent: "center",
  paddingStart: spacing.sm,
})
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
